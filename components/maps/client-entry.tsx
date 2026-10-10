"use client";

import "@/lib/maplibre-worker";
import { installRecorder } from "@/lib/inspector";
import { GATEWAY } from "@/lib/config";
import { MapsApp } from "@/components/maps/maps-app";

// Before the map exists, so the inspector sees the style request the map makes on creation.
installRecorder(GATEWAY);

export default MapsApp;
