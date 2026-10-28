import { createFileRoute, Link } from "@tanstack/react-router";

import { Storefront } from "@/components/storefront";
import { isCategory } from "@/lib/store/types";

export const Route = createFileRoute("/category/$slug")({
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  if (!isCategory(slug)) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-extrabold">Unknown lane</h1>
        <Link to="/" search={{ browse: true }} className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-violet">
          All services
        </Link>
      </main>
    );
  }
  return <Storefront category={slug} />;
}
