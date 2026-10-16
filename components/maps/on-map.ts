/**
 * The surface for an outline button that floats on the map rather than on the page: the popover
 * tokens, in both modes. The outline variant's own dark ground is a 30% wash of --input, made to
 * sit on the page background; over the map there is none, and the button reads as transparent.
 * The map-controls registry item gives its buttons the same treatment.
 */
export const ON_MAP_BUTTON = "bg-popover text-popover-foreground hover:bg-muted dark:bg-popover dark:hover:bg-muted";
