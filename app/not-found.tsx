import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="text-center max-w-md">
        <p className="text-7xl font-bold text-cyan-500 mb-4">404</p>
        <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
        <p className="text-slate-400 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  )
}
