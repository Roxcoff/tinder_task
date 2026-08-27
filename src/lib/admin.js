function adminNames() {
  return (process.env.ADMIN_NAMES || "")
    .split(",")
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminName(name) {
  if (!name) return false;
  return adminNames().includes(name.trim().toLowerCase());
}

module.exports = { isAdminName };
