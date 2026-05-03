// ============================================================
// db.js — All Supabase database operations
// ============================================================
import { sb, currentUser } from './auth.js';

// ---- HELPERS ----
function uid() { return currentUser?.id; }

function ratingCols(ratings) {
  return {
    rating_food: ratings.food || null,
    rating_atmosphere: ratings.atmosphere || null,
    rating_service: ratings.service || null,
    rating_noise: ratings.noise || null,
    rating_value: ratings.value || null,
  };
}

function rowToRestaurant(r) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    cuisine: r.cuisine,
    city: r.city,
    date: r.visit_date,
    address: r.address,
    coords: (r.coords_lat && r.coords_lng) ? { lat: r.coords_lat, lng: r.coords_lng } : null,
    ratings: {
      food: r.rating_food,
      atmosphere: r.rating_atmosphere,
      service: r.rating_service,
      noise: r.rating_noise,
      value: r.rating_value,
    },
    overall: r.overall_avg,
    notes: r.notes,
    wouldReturn: r.would_return,
    isPublic: r.is_public,
    createdAt: r.created_at,
    profile: r.profiles ?? null,
  };
}

function rowToDish(d) {
  return {
    id: d.id,
    userId: d.user_id,
    restaurantId: d.restaurant_id,
    name: d.name,
    category: d.category,
    rating: d.rating,
    notes: d.notes,
    isPublic: d.is_public,
    createdAt: d.created_at,
    profile: d.profiles ?? null,
  };
}

// ---- RESTAURANTS ----
export async function getMyRestaurants() {
  const { data, error } = await sb
    .from('restaurants')
    .select('*')
    .eq('user_id', uid())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(rowToRestaurant);
}

export async function getPublicRestaurants(search = '') {
  let q = sb
    .from('restaurants')
    .select('*, profiles(username, display_name, avatar_color)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(60);
  if (search) q = q.ilike('name', `%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data.map(rowToRestaurant);
}

export async function saveRestaurant(form, editId = null) {
  const vals = ratingCols(form.ratings);
  // overall_avg is now a server-side generated column — never sent from client

  // Clamp coords to valid ranges
  const lat = form.coords?.lat;
  const lng = form.coords?.lng;
  const validLat = (lat != null && lat >= -90  && lat <= 90)  ? lat : null;
  const validLng = (lng != null && lng >= -180 && lng <= 180) ? lng : null;

  const payload = {
    user_id: uid(),
    name:        String(form.name).slice(0, 200),
    cuisine:     form.cuisine  ? String(form.cuisine).slice(0, 100)  : null,
    city:        form.city     ? String(form.city).slice(0, 100)     : null,
    visit_date:  form.date     ? String(form.date).slice(0, 50)      : null,
    address:     form.address  ? String(form.address).slice(0, 300)  : null,
    coords_lat:  validLat,
    coords_lng:  validLng,
    notes:       form.notes    ? String(form.notes).slice(0, 5000)   : null,
    would_return: ['yes','maybe','no'].includes(form.wouldReturn) ? form.wouldReturn : null,
    is_public:   Boolean(form.isPublic),
    // updated_at is set by DB trigger, not supplied here
    ...vals,
  };

  if (editId) {
    const { data, error } = await sb.from('restaurants').update(payload).eq('id', editId).select().single();
    if (error) throw error;
    return rowToRestaurant(data);
  } else {
    const { data, error } = await sb.from('restaurants').insert(payload).select().single();
    if (error) throw error;
    return rowToRestaurant(data);
  }
}

export async function deleteRestaurant(id) {
  const { error } = await sb.from('restaurants').delete().eq('id', id);
  if (error) throw error;
}

// ---- DISHES ----
export async function getMyDishes(restaurantId = null) {
  let q = sb.from('dishes').select('*').eq('user_id', uid()).order('created_at', { ascending: false });
  if (restaurantId) q = q.eq('restaurant_id', restaurantId);
  const { data, error } = await q;
  if (error) throw error;
  return data.map(rowToDish);
}

export async function getPublicDishes() {
  const { data, error } = await sb
    .from('dishes')
    .select('*, profiles(username, display_name, avatar_color)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  return data.map(rowToDish);
}

export async function saveDish(form, editId = null) {
  const validCategories = ['Starter','Main','Dessert','Drink','Side','Other'];
  const rating = Math.min(10, Math.max(1, parseInt(form.rating) || 5));
  const payload = {
    user_id:       uid(),
    restaurant_id: form.restaurantId || null,
    name:          String(form.name).slice(0, 200),
    category:      validCategories.includes(form.category) ? form.category : null,
    rating,
    notes:         form.notes ? String(form.notes).slice(0, 2000) : null,
    is_public:     Boolean(form.isPublic),
  };
  if (editId) {
    const { data, error } = await sb.from('dishes').update(payload).eq('id', editId).select().single();
    if (error) throw error;
    return rowToDish(data);
  } else {
    const { data, error } = await sb.from('dishes').insert(payload).select().single();
    if (error) throw error;
    return rowToDish(data);
  }
}

export async function deleteDish(id) {
  const { error } = await sb.from('dishes').delete().eq('id', id);
  if (error) throw error;
}

// ---- PROFILE ----
export async function updateProfile(fields) {
  const { data, error } = await sb.from('profiles').update(fields).eq('id', uid()).select().single();
  if (error) throw error;
  return data;
}
