import { Compass } from 'lucide-react';

export default function ExploreV2() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
      <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center">
        <Compass className="w-8 h-8 text-brand-500" />
      </div>
      <h2 className="text-lg font-black text-gray-900">Explore</h2>
      <p className="text-sm text-gray-500 text-center">Coming soon — exciting features await!</p>
    </div>
  );
}
