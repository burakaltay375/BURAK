export type DiscoverPlaceType =
  | "restaurant"
  | "cafe"
  | "pharmacy"
  | "historic"
  | "museum"
  | "attraction"
  | "park"
  | "hospital"
  | "shop";

export interface NearbyPlace {
  id: string;
  title: string;
  address?: string | null;
  rating?: number | null;
  reviews?: number | null;
  phone?: string | null;
  website?: string | null;
  open_state?: string | null;
  thumbnail?: string | null;
  gps_coordinates: {
    latitude: number;
    longitude: number;
  };
}

export type DiscoverMapProps = {
  latitude: number;
  longitude: number;
  hotelName: string;
  placeType: DiscoverPlaceType;
};
