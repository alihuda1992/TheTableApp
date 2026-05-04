// ============================================================
// map.js — Leaflet map integration
// ============================================================

let map = null;
let markers = [];
let userMarker = null;

export function initMap(restaurants) {
  if (map) {
    refreshMarkers(restaurants);
    return;
  }
  map = L.map('map', { zoomControl: true }).setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://openstreetmap.org">OSM</a> © <a href="https://carto.com">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
  refreshMarkers(restaurants);
}

export function refreshMarkers(restaurants) {
  if (!map) return;
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  const withCoords = restaurants.filter(r => r.coords);
  withCoords.forEach(r => {
    const icon = L.divIcon({
      html: `<div style="width:13px;height:13px;background:#c0622a;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
      className: '', iconSize: [13,13], iconAnchor: [6,6]
    });
    const m = L.marker([r.coords.lat, r.coords.lng], { icon })
      .addTo(map)
      .bindPopup(popupHtml(r));
    markers.push(m);
  });
  if (markers.length === 1) {
    map.setView([withCoords[0].coords.lat, withCoords[0].coords.lng], 14);
  } else if (markers.length > 1) {
    try { map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2)); } catch(e) {}
  }
}

function popupHtml(r) {
  return `<div style="font-family:'DM Sans',sans-serif;min-width:150px">
    <b style="font-size:0.92rem">${r.name}</b><br>
    ${r.cuisine ? `<span style="font-size:0.74rem;color:#888">${r.cuisine}</span><br>` : ''}
    ${r.city ? `<span style="font-size:0.74rem;color:#888">📍 ${r.city}</span><br>` : ''}
    ${r.overall ? `<span style="font-size:0.74rem">⭐ ${r.overall}/5</span>` : ''}
  </div>`;
}

export function locateUser(restaurants, onFound) {
  if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    if (userMarker) map.removeLayer(userMarker);
    const youIcon = L.divIcon({
      html: `<div style="width:15px;height:15px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(59,130,246,0.5)"></div>`,
      className: '', iconSize: [15,15], iconAnchor: [7,7]
    });
    userMarker = L.marker([lat, lng], { icon: youIcon }).addTo(map).bindPopup('<b>You are here</b>');
    const withCoords = restaurants.filter(r => r.coords);
    if (withCoords.length) {
      const sorted = withCoords.map(r => ({
        ...r,
        dist: haversine(lat, lng, r.coords.lat, r.coords.lng)
      })).sort((a,b) => a.dist - b.dist);
      onFound(sorted[0]);
      const allPts = [...markers.map(m => m.getLatLng()), { lat, lng }];
      map.fitBounds(L.latLngBounds(allPts).pad(0.25));
    } else {
      map.setView([lat, lng], 12);
      onFound(null);
    }
  }, () => alert('Could not get location. Please allow location access.'));
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, d2r = Math.PI/180;
  const dLat = (lat2-lat1)*d2r, dLon = (lon2-lon1)*d2r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export async function geocodeAddress(address) {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=en`;
    const res = await fetch(url);
    const data = await res.json();
    const f = data.features?.[0];
    if (f) return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
  } catch(e) {}
  return null;
}
