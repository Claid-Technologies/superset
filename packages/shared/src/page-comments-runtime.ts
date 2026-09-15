import {
	PAGE_PINCH_ZOOM_RUNTIME_SOURCE,
	type PageViewportZoom,
} from "./page-zoom";

export interface CommentAnchor {
	path: string;
	tag: string;
	text: string;
	/**
	 * Where inside the element the reader clicked, as a fraction of its box
	 * (0..1). Fractions rather than pixels so a pin keeps its place when the
	 * page reflows at a different width. Absent on threads written before pins
	 * carried a click point; those fall back to the element's top-left corner.
	 */
	offsetX?: number;
	offsetY?: number;
}

export interface FrameRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

export const HOST_CHANNEL = "superset-comments/host";
export const FRAME_CHANNEL = "superset-comments/frame";

export const PENDING_ANCHOR_ID = "superset-pending-anchor";

export interface RuntimePin {
	id: string;
	anchor: CommentAnchor;
	label: string;
	resolved: boolean;
}

export type HostMessageBody =
	| { type: "ready" }
	| { type: "enable-pinch-zoom" }
	| { type: "set-mode"; enabled: boolean; locked: boolean }
	| { type: "track"; anchors: { id: string; anchor: CommentAnchor }[] }
	| { type: "render-pins"; pins: RuntimePin[] }
	| { type: "restore-scroll"; y: number };

export type HostMessage = HostMessageBody & { channel: typeof HOST_CHANNEL };

export type FrameMessage =
	| { channel: typeof FRAME_CHANNEL; type: "ready" }
	| {
			channel: typeof FRAME_CHANNEL;
			type: "viewport-zoom";
			viewport: PageViewportZoom;
	  }
	| { channel: typeof FRAME_CHANNEL; type: "hover"; rect: FrameRect | null }
	| { channel: typeof FRAME_CHANNEL; type: "pointer-down" }
	| { channel: typeof FRAME_CHANNEL; type: "escape" }
	| { channel: typeof FRAME_CHANNEL; type: "scroll"; y: number }
	| {
			channel: typeof FRAME_CHANNEL;
			type: "pick";
			anchor: CommentAnchor;
			rect: FrameRect;
	  }
	| {
			channel: typeof FRAME_CHANNEL;
			type: "rects";
			entries: { id: string; rect: FrameRect | null }[];
	  }
	| { channel: typeof FRAME_CHANNEL; type: "pin-press"; id: string };

/**
 * Runs inside the served page. It is generic — it never reads page content,
 * it only measures and reports DOM elements the host asks about — and it is
 * inert until the host sends `set-mode`. The usercontent origin serves it
 * same-origin at `RUNTIME_SCRIPT_PATH` and injects one script tag per page.
 */
export const PAGE_COMMENTS_RUNTIME_SOURCE = `(() => {
	const HOST = ${JSON.stringify(HOST_CHANNEL)};
	const FRAME = ${JSON.stringify(FRAME_CHANNEL)};

	let enabled = false;
	let locked = false;
	let lockedAtPointerDown = false;
	let tracked = [];
	let lastHoverPath = null;
	let frame = 0;
	let lastScrollY = 0;
	let restoreY = null;
	let restoreDeadline = 0;
	let lastScrollPost = 0;
	let settleTimer = 0;
	let pins = [];
	let pinLayer = null;
	let placeFrame = 0;
	const SCROLL_POST_IDLE_MS = 150;

	const post = (message) => {
		parent.postMessage({ channel: FRAME, ...message }, "*");
	};

	const pathOf = (el) => {
		const parts = [];
		let node = el;
		while (node && node.nodeType === 1 && node !== document.body) {
			const parent = node.parentElement;
			if (!parent) return "";
			let index = 1;
			for (let s = node.previousElementSibling; s; s = s.previousElementSibling) {
				if (s.tagName === node.tagName) index += 1;
			}
			parts.unshift(node.tagName.toLowerCase() + ":nth-of-type(" + index + ")");
			node = parent;
		}
		return parts.join(" > ");
	};

	const resolveCache = new Map();

	const resolve = (path) => {
		if (!path) return null;
		const cached = resolveCache.get(path);
		if (cached && cached.isConnected) return cached;
		try {
			const el = document.body.querySelector(":scope > " + path);
			if (el) resolveCache.set(path, el);
			else resolveCache.delete(path);
			return el;
		} catch {
			return null;
		}
	};

	const rectOf = (el) => {
		const r = el.getBoundingClientRect();
		if (r.width === 0 && r.height === 0) return null;
		return { top: r.top, left: r.left, width: r.width, height: r.height };
	};

	const fraction = (offset, extent) => {
		if (!(extent > 0)) return 0;
		return Math.min(Math.max(offset / extent, 0), 1);
	};

	const inset = (offset, extent) => {
		if (extent <= PIN_SIZE) return extent / 2;
		return Math.min(Math.max(offset, PIN_SIZE / 2), extent - PIN_SIZE / 2);
	};

	const targetAt = (x, y) => {
		const el = document.elementFromPoint(x, y);
		if (!el || el === document.body || el === document.documentElement) return null;
		return el;
	};

	const applyRestore = () => {
		if (restoreY === null) return;
		if (Date.now() > restoreDeadline) {
			restoreY = null;
			return;
		}
		scrollTo({ top: restoreY, behavior: "instant" });
	};

	const syncRects = () => {
		post({
			type: "rects",
			entries: tracked.map((t) => {
				const el = resolve(t.anchor.path);
				return { id: t.id, rect: el ? rectOf(el) : null };
			}),
		});
	};

	const PIN_SIZE = 28;
	const STACK_OFFSET = 24;

	const ensurePinLayer = () => {
		if (pinLayer && pinLayer.isConnected) return pinLayer;
		pinLayer = document.createElement("div");
		pinLayer.setAttribute("data-superset-pins", "");
		pinLayer.style.cssText =
			"position:absolute;top:0;left:0;width:0;height:0;z-index:2147483646;";
		document.body.appendChild(pinLayer);
		return pinLayer;
	};

	const pinElement = (pin) => {
		const el = document.createElement("button");
		el.type = "button";
		el.textContent = pin.label || "?";
		el.style.cssText =
			"position:absolute;display:flex;align-items:center;justify-content:center;" +
			"width:" + PIN_SIZE + "px;height:" + PIN_SIZE + "px;padding:0;margin:0;" +
			"border-radius:9999px;border-bottom-left-radius:4px;" +
			"border:1px solid rgba(255,255,255,0.2);" +
			"background:" + (pin.resolved ? "#737373" : "#2563eb") + ";" +
			"color:#fff;font:600 11px system-ui,-apple-system,sans-serif;" +
			"box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;" +
			"-webkit-tap-highlight-color:transparent;touch-action:manipulation;";
		el.addEventListener(
			"click",
			(event) => {
				event.preventDefault();
				event.stopPropagation();
				post({ type: "pin-press", id: pin.id });
			},
			true,
		);
		return el;
	};

	const placePins = () => {
		if (!pins.length) {
			if (pinLayer) pinLayer.replaceChildren();
			return;
		}
		const layer = ensurePinLayer();
		const placed = [];
		const next = document.createDocumentFragment();

		for (const pin of pins) {
			const el = resolve(pin.anchor.path);
			if (!el) continue;
			const r = el.getBoundingClientRect();
			if (r.width === 0 && r.height === 0) continue;

			const fx = pin.anchor.offsetX === undefined ? 0 : pin.anchor.offsetX;
			const fy = pin.anchor.offsetY === undefined ? 0 : pin.anchor.offsetY;
			const x = r.left + scrollX + inset(fx * r.width, r.width);
			const y = r.top + scrollY + inset(fy * r.height, r.height);

			let index = 0;
			while (
				placed.some(
					(p) =>
						Math.abs(p.x - (x + index * STACK_OFFSET)) < STACK_OFFSET &&
						Math.abs(p.y - y) < PIN_SIZE,
				)
			) {
				index += 1;
			}
			placed.push({ x: x + index * STACK_OFFSET, y });

			const node = pinElement(pin);
			node.style.left = x - PIN_SIZE / 2 + index * STACK_OFFSET + "px";
			node.style.top = y - PIN_SIZE / 2 + "px";
			node.style.zIndex = String(index);
			next.appendChild(node);
		}

		layer.replaceChildren(next);
	};

	const schedulePlace = () => {
		if (placeFrame) return;
		placeFrame = requestAnimationFrame(() => {
			placeFrame = 0;
			placePins();
		});
	};

	const postScroll = () => {
		if (settleTimer) {
			clearTimeout(settleTimer);
			settleTimer = 0;
		}
		if (restoreY !== null || scrollY === lastScrollY) return;
		lastScrollY = scrollY;
		lastScrollPost = Date.now();
		post({ type: "scroll", y: scrollY });
	};

	const schedule = () => {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			const pinned = tracked.length > 0;
			if (pinned) syncRects();
			if (restoreY !== null && Date.now() > restoreDeadline) restoreY = null;
			if (restoreY !== null || scrollY === lastScrollY) return;
			if (pinned || Date.now() - lastScrollPost >= SCROLL_POST_IDLE_MS) {
				postScroll();
				return;
			}
			if (!settleTimer) {
				settleTimer = setTimeout(postScroll, SCROLL_POST_IDLE_MS);
			}
		});
	};

	document.addEventListener(
		"mousemove",
		(event) => {
			if (!enabled || locked) return;
			const el = targetAt(event.clientX, event.clientY);
			const path = el ? pathOf(el) : null;
			if (path === lastHoverPath) return;
			lastHoverPath = path;
			post({ type: "hover", rect: el ? rectOf(el) : null });
		},
		true,
	);

	document.addEventListener("mouseleave", () => {
		if (!enabled) return;
		lastHoverPath = null;
		post({ type: "hover", rect: null });
	});

	// Escape pressed while the frame has focus never reaches the host window,
	// so the frame forwards it out.
	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key !== "Escape") return;
			post({ type: "escape" });
		},
		true,
	);

	// The host dismisses whatever is open on pointer-down and unlocks the frame
	// before this same gesture's click arrives, so the click has to remember
	// that it began as a dismiss or it starts a new pick.
	document.addEventListener(
		"mousedown",
		() => {
			lockedAtPointerDown = locked;
			post({ type: "pointer-down" });
		},
		true,
	);

	document.addEventListener(
		"click",
		(event) => {
			const dismissing = lockedAtPointerDown;
			lockedAtPointerDown = false;
			if (!enabled) return;
			event.preventDefault();
			event.stopPropagation();
			if (locked || dismissing) return;
			const el = targetAt(event.clientX, event.clientY);
			if (!el) return;
			const rect = rectOf(el);
			if (!rect) return;
			post({
				type: "pick",
				anchor: {
					path: pathOf(el),
					tag: el.tagName.toLowerCase(),
					text: (el.textContent || "").trim().slice(0, 140),
					offsetX: fraction(event.clientX - rect.left, rect.width),
					offsetY: fraction(event.clientY - rect.top, rect.height),
				},
				rect,
			});
		},
		true,
	);

	const pinchZoom = (${PAGE_PINCH_ZOOM_RUNTIME_SOURCE})((viewport) => {
		post({ type: "viewport-zoom", viewport });
		lastHoverPath = null;
		post({ type: "hover", rect: null });
		schedule();
	}, () => locked);

	addEventListener(
		"scroll",
		() => {
			if (enabled && lastHoverPath !== null) {
				lastHoverPath = null;
				post({ type: "hover", rect: null });
			}
			schedule();
		},
		true,
	);
	addEventListener("resize", () => {
		schedule();
		schedulePlace();
	});
	for (const type of ["wheel", "touchstart", "keydown"]) {
		addEventListener(type, () => {
			restoreY = null;
		}, { capture: true, passive: true });
	}
	new ResizeObserver(() => {
		applyRestore();
		schedule();
		schedulePlace();
	}).observe(document.documentElement);
	new MutationObserver((records) => {
		let ours = true;
		for (const record of records) {
			if (pinLayer && pinLayer.contains(record.target)) continue;
			ours = false;
			if (record.type === "childList") {
				resolveCache.clear();
				break;
			}
		}
		if (ours) return;
		schedule();
		schedulePlace();
	}).observe(document.documentElement, {
		subtree: true,
		childList: true,
		attributes: true,
		characterData: true,
	});

	addEventListener("message", (event) => {
		const data = event.data;
		if (!data || data.channel !== HOST) return;
		if (data.type === "enable-pinch-zoom" && event.source === parent) pinchZoom.enable();
		if (data.type === "ready") post({ type: "ready" });
		if (data.type === "set-mode") {
			enabled = Boolean(data.enabled);
			locked = Boolean(data.locked);
			document.documentElement.style.cursor =
				enabled && !locked ? "crosshair" : "";
			if (!enabled || locked) {
				lastHoverPath = null;
				post({ type: "hover", rect: null });
			}
		}
		if (data.type === "track") {
			tracked = Array.isArray(data.anchors) ? data.anchors : [];
			schedule();
		}
		if (data.type === "render-pins") {
			pins = Array.isArray(data.pins) ? data.pins : [];
			schedulePlace();
		}
		if (data.type === "restore-scroll") {
			restoreY = Number(data.y) || 0;
			restoreDeadline = Date.now() + 1000;
			applyRestore();
		}
	});

	post({ type: "ready" });
})();`;
