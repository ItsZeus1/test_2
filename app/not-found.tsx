import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 text-center">
      <Gamepad2 className="mb-4 h-14 w-14 text-zinc-700" />
      <h1 className="text-3xl font-bold text-white">Page not found</h1>
      <p className="mt-2 max-w-sm text-zinc-500">
        This game or page doesn&apos;t exist. Let&apos;s get you back to the catalog.
      </p>
      <Link href="/" className="mt-6">
        <Button>Back to homepage</Button>
      </Link>
    </div>
  );
}
