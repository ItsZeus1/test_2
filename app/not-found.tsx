import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-extrabold">404</h1>
        <p className="mt-3 text-sm text-muted">Page not found · الصفحة غير موجودة</p>
        <Link href="/" className="btn-glow mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
          NovaCharge
        </Link>
      </div>
    </div>
  );
}
