const CLIENT_ID_META = "google-oauth-client-id";

export function readDefaultClientId(root = document) {
  return (
    root
      .querySelector(`meta[name="${CLIENT_ID_META}"]`)
      ?.getAttribute("content")
      ?.trim() ?? ""
  );
}
