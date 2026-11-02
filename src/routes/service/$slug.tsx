import { createFileRoute } from "@tanstack/react-router";

import { ServiceCheckout } from "@/components/service-checkout";

export const Route = createFileRoute("/service/$slug")({
  head: () => ({ meta: [{ title: "Checkout · NovaCharge" }] }),
  component: ServicePage,
});

function ServicePage() {
  const { slug } = Route.useParams();
  return <ServiceCheckout slug={slug} />;
}
