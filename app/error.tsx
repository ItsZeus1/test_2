"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn&apos;t load · تعذّر تحميل الصفحة</h1>
        <button onClick={reset} className="btn-glow mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
          Try again · إعادة المحاولة
        </button>
      </div>
    </div>
  );
}
