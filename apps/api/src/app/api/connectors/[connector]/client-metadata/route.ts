import { getConnector } from "@superset/shared/connectors";
import { clientMetadataUrl } from "@superset/trpc/connectors";

import { redirectUriFor } from "../connect/route";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ connector: string }> },
) {
	const { connector: slug } = await params;
	if (!getConnector(slug)) {
		return Response.json({ error: "Unknown connector" }, { status: 404 });
	}

	return Response.json(
		{
			client_id: clientMetadataUrl(slug),
			client_name: "Superset",
			client_uri: "https://superset.sh",
			redirect_uris: [redirectUriFor(slug)],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
			application_type: "web",
		},
		{
			headers: {
				"cache-control": "public, max-age=3600",
				"content-type": "application/json",
			},
		},
	);
}
