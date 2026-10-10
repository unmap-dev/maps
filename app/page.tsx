"use client";

import dynamic from "next/dynamic";

// Every path is this one page (wrangler.jsonc serves index.html for any path that is not a file),
// and the URL is the state, so the app renders in the browser only: a prerendered "/" would never
// match the path it is served on.
const MapsApp = dynamic(() => import("@/components/maps/client-entry"), {
  ssr: false,
  loading: () => <div className="h-dvh w-full bg-muted" aria-busy="true" aria-label="Loading map" />,
});

export default function Page() {
  return <MapsApp />;
}
