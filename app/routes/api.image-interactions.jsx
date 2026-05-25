import { corsJson, optionsResponse } from "../services/cors.server";

export async function action({ request }) {
  if (request.method === "OPTIONS") return optionsResponse();

  return corsJson(
    { success: false, error: "Interactions are disabled." },
    { status: 410 },
  );
}
