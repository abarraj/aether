import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
      <div className="flex flex-col items-center text-center">
        <div className="text-7xl font-bold tracking-tighter text-zinc-800">
          404
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-200">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-600"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
