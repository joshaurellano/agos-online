import 'package:latlong2/latlong.dart';

/// Official boundary of Barangay Triangulo, Naga City.
///
/// Digitised from the official "Barangay Triangulo Base Map" (City of Naga,
/// 1:2500, Web Mercator / EPSG:3857 grid). The red barangay outline was
/// georeferenced against the map's 400 m grid lines and converted to WGS84
/// lat/lng. Accuracy is roughly +/-5 m, limited by the printed line width.
///
/// This is the single source of truth: the flood map, the evacuation map,
/// the "am I inside the barangay" check and the offline tile area all use it.
const trianguloBoundary = <LatLng>[
  LatLng(13.619407, 123.185103), LatLng(13.618035, 123.184731),
  LatLng(13.617705, 123.184752), LatLng(13.608254, 123.201475),
  LatLng(13.619469, 123.197031), LatLng(13.619634, 123.197031),
  LatLng(13.620985, 123.197541), LatLng(13.621068, 123.196500),
  LatLng(13.621677, 123.196521), LatLng(13.622677, 123.189143),
  LatLng(13.621646, 123.189111), LatLng(13.621635, 123.188473),
  LatLng(13.621811, 123.187963), LatLng(13.621233, 123.187368),
  LatLng(13.621223, 123.187240), LatLng(13.621295, 123.187081),
];

/// Initial camera centre (middle of the boundary's bounding box).
const trianguloCenter = LatLng(13.6154, 123.1931);
