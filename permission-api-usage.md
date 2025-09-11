## 🎯 **Fixed Permission API Usage Guide**

### **Problem Solved:**
1. ✅ **Fixed `data: null` response** - Now returns actual permission data
2. ✅ **Simplified to single endpoint** - Uses OrgContextGuard instead of separate routes

---

### **New API Usage:**

#### **1. Get Permissions with Organization Context**

**Endpoint:** `GET /users/me/permissions`

**Headers Required:**
```bash
Authorization: Bearer <your-jwt-token>
X-Org-Id: <organization-id>
```

**Alternative - Query Parameter:**
```bash
GET /users/me/permissions?orgId=<organization-id>
```

---

### **API Response Examples:**

#### **✅ Success Response:**
```json
{
  "status": "success",
  "data": {
    "organizationId": "68b5b5b13c160bca6e86ad26",
    "role": "owner",
    "permissions": [
      "home.view",
      "home.recent", 
      "home.favorites",
      "home.dashboard",
      "sensors.view",
      "sensors.live",
      "sensors.historical",
      "sensors.create",
      "sensors.delete",
      "gateways.view",
      "gateways.details",
      "gateways.delete",
      "telemetry.view",
      "telemetry.historical",
      "org.rename",
      "org.billing",
      "org.members.manage",
      "org.permissions.grant"
    ]
  },
  "message": "You have 18 permissions in this organization"
}
```

#### **❌ Missing Org Context:**
```json
{
  "status": 400,
  "message": "Organization context required. Please provide X-Org-Id header or orgId query parameter"
}
```

---

### **Frontend Implementation:**

#### **React/JavaScript Example:**
```javascript
// ✅ Method 1: Using Header
const getPermissions = async (orgId) => {
  const response = await fetch('/api/users/me/permissions', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Org-Id': orgId
    }
  });
  
  const result = await response.json();
  if (result.status === 'success') {
    return result.data.permissions; // Array of permission strings
  }
  throw new Error(result.message);
};

// ✅ Method 2: Using Query Parameter  
const getPermissionsAlt = async (orgId) => {
  const response = await fetch(`/api/users/me/permissions?orgId=${orgId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  return result.data.permissions;
};

// Usage in component
const Dashboard = ({ currentOrgId }) => {
  const [permissions, setPermissions] = useState([]);
  
  useEffect(() => {
    getPermissions(currentOrgId)
      .then(setPermissions)
      .catch(console.error);
  }, [currentOrgId]);
  
  return (
    <div>
      {permissions.includes('sensors.create') && (
        <button>Create Sensor</button>
      )}
      {permissions.includes('gateways.delete') && (
        <button>Delete Gateway</button>
      )}
      {permissions.includes('org.billing') && (
        <Link to="/billing">Billing</Link>
      )}
    </div>
  );
};
```

---

### **Key Benefits:**

1. **🔄 Single Endpoint:** No need for multiple permission routes
2. **🎯 Context-Aware:** Automatically resolves organization from header/query
3. **📊 Rich Data:** Returns computed effective permissions (what user can actually do)
4. **🛡️ Consistent:** Same pattern as other organization-scoped endpoints
5. **⚡ Efficient:** Leverages existing OrgContextGuard logic

---

### **Testing the API:**

```bash
# Test with header
curl -H "Authorization: Bearer <token>" \
     -H "X-Org-Id: 68b5b5b13c160bca6e86ad26" \
     http://localhost:3000/users/me/permissions

# Test with query parameter
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/users/me/permissions?orgId=68b5b5b13c160bca6e86ad26"

# Test missing org context (should return 400)
curl -H "Authorization: Bearer <token>" \
     http://localhost:3000/users/me/permissions
```

The API now provides a clean, consistent interface for accessing user permissions! 🚀
