# Enhanced Membership Update API Test

## Test the new comprehensive membership update functionality

### 1. Update Role Only (existing functionality - now improved)
```bash
PATCH /organizations/{orgId}/members/{membershipId}/role
Content-Type: application/json

{
  "role": "ADMIN"
}
```

### 2. Update Permissions Only (existing functionality)
```bash
PATCH /organizations/{orgId}/members/{membershipId}/permissions
Content-Type: application/json

{
  "allow": ["sensors.view", "sensors.create"],
  "deny": ["sensors.delete"]
}
```

### 3. Update Role AND Permissions Together (NEW!)
```bash
PATCH /organizations/{orgId}/members/{membershipId}
Content-Type: application/json

{
  "role": "MEMBER",
  "allow": ["sensors.view", "sensors.live", "gateways.view"],
  "deny": ["sensors.delete", "gateways.delete"]
}
```

### 4. Update Only Permissions (partial update)
```bash
PATCH /organizations/{orgId}/members/{membershipId}
Content-Type: application/json

{
  "allow": ["home.view", "sensors.view"]
}
```

### 5. Update Only Role (partial update)
```bash
PATCH /organizations/{orgId}/members/{membershipId}
Content-Type: application/json

{
  "role": "ADMIN"
}
```

## Key Improvements:
✅ No longer clears permissions when role changes
✅ Can update role and permissions in single API call
✅ Validates permission strings against available permissions
✅ Supports partial updates (only role, only permissions, or both)
✅ Maintains backward compatibility with existing endpoints
