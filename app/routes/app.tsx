import type {
  LinksFunction,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Outlet, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import adminStylesHref from "../admin.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: adminStylesHref },
];

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

function AdminLoadingIndicator() {
  const navigation = useNavigation();
  const isBusy =
    navigation.state === "loading" || navigation.state === "submitting";

  if (!isBusy) return null;

  return (
    <>
      <div className="aim-admin-loading-bar" aria-hidden="true" />
      <div className="aim-admin-loading-overlay" role="status" aria-live="polite">
        <div className="aim-admin-loading-overlay__panel">
          <span className="aim-admin-spinner" />
          {navigation.state === "submitting" ? "Saving changes..." : "Loading..."}
        </div>
      </div>
    </>
  );
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <AdminLoadingIndicator />
      <s-app-nav>
        <s-link href="/app">Overview</s-link>
        <s-link href="/app/gallery">Media library</s-link>
        <s-link href="/app/print-on-demand">Print on demand</s-link>
        <s-link href="/app/dashboard">Customers</s-link>
        <s-link href="/app/reviews">Reviews</s-link>
        <s-link href="/app/admin">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
