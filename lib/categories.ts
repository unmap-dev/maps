import {
  BedIcon,
  CoffeeIcon,
  FuelIcon,
  LandmarkIcon,
  PillIcon,
  PlugZapIcon,
  ShoppingCartIcon,
  TreesIcon,
  UtensilsIcon,
  type LucideIcon,
} from "lucide-react";

/** The category chips across the top of the map, as unmap taxonomy ids (pipeline/geocoding/taxonomy.json). */
export const CHIPS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "food.restaurant", label: "Restaurants", icon: UtensilsIcon },
  { id: "food.cafe", label: "Coffee", icon: CoffeeIcon },
  { id: "recreation.park", label: "Parks", icon: TreesIcon },
  { id: "shop.supermarket", label: "Groceries", icon: ShoppingCartIcon },
  { id: "transport.fuel", label: "Gas", icon: FuelIcon },
  { id: "transport.charging_station", label: "EV charging", icon: PlugZapIcon },
  { id: "accommodation.hotel", label: "Hotels", icon: BedIcon },
  { id: "health.pharmacy", label: "Pharmacies", icon: PillIcon },
  { id: "culture.museum", label: "Museums", icon: LandmarkIcon },
];

/** `food.fast_food` → "Fast food". The taxonomy id is the only category name the API returns. */
export function categoryLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  const chip = CHIPS.find((c) => c.id === id);
  if (chip) return chip.label.replace(/s$/, "");
  const leaf = id.split(".").pop() ?? id;
  const words = leaf.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function chipLabel(id: string): string {
  return CHIPS.find((c) => c.id === id)?.label ?? categoryLabel(id) ?? id;
}
