export default function Loading() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-3 w-64 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-64 w-full bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}
