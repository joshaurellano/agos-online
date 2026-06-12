export const RESIDENT_ROLE_ID = 7;

export function isResident(user) {
  return user?.role_id === RESIDENT_ROLE_ID;
}

export function isAdmin(user) {
  return user?.roles?.role_desc === 'Admin';
}