# 🛠️ **Settings Module - Cleaned & Fixed**

## **✅ Issues Fixed:**

1. **❌ Mixed organization context** → **✅ Proper OrgContextGuard usage**
2. **❌ Redundant CRUD methods** → **✅ Streamlined service methods**
3. **❌ Inconsistent API responses** → **✅ Standardized response format**
4. **❌ Missing role-based permissions** → **✅ Proper admin/owner-only access**
5. **❌ Unused/duplicate DTOs** → **✅ Clean, focused DTOs**

---

## **📊 Settings Architecture**

### **1. Organization Settings (Admin/Owner Only)**
- **Purpose:** Configure org-wide behavior that affects all members
- **Current Fields:** `sensorOfflineTimeOut` (in minutes)
- **Access:** Only `OWNER` and `ADMIN` roles can read/write
- **Scope:** Per organization

### **2. User Settings (Personal Preferences)**
- **Purpose:** Individual user preferences across organizations
- **Current Fields:** `defaultOrgId`, `orgChoiceMode`
- **Access:** Any authenticated user can read/write their own
- **Scope:** Per user (global)

---

## **🚀 API Endpoints**

### **Organization Settings**

#### **GET /settings**
Get organization settings (requires org context)

**Headers:**
```bash
Authorization: Bearer <token>
X-Org-Id: <organization-id>
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "sensorOfflineTimeOut": 10,
    "orgId": "68b5b5b13c160bca6e86ad26"
  },
  "message": "Organization settings retrieved successfully"
}
```

#### **PUT /settings**
Update organization settings (Admin/Owner only)

**Body:**
```json
{
  "sensorOfflineTimeOut": 15
}
```

---

### **User Settings**

#### **GET /settings/me**
Get personal user settings

**Response:**
```json
{
  "status": "success",
  "data": {
    "userId": "68b5af38753ef479d41bdff8",
    "defaultOrgId": "68b5b5b13c160bca6e86ad26",
    "orgChoiceMode": "remember"
  },
  "message": "User settings retrieved successfully"
}
```

#### **PUT /settings/me**
Update personal user settings

**Body:**
```json
{
  "defaultOrgId": "68b5b5b13c160bca6e86ad26",
  "orgChoiceMode": "ask-every-time"
}
```

---

## **🔧 Service Methods (Cleaned)**

### **Organization Settings:**
- `findByOrgId(orgId)` - Get settings for organization
- `createOrUpdate(orgId, data)` - Upsert organization settings
- `create(orgId, data)` - *(private)* Create new settings
- `update(orgId, data)` - *(private)* Update existing settings

### **User Settings:**
- `findUserSettingsByUserId(userId)` - Get user settings
- `updateUserSettings(userId, data)` - Upsert user settings (uses MongoDB upsert)
- `createOrUpdateUserSettings(userId, data)` - Alias for updateUserSettings

---

## **📝 Usage Examples**

### **Frontend - Organization Settings**
```javascript
// Get org settings (admin/owner only)
const getOrgSettings = async (orgId) => {
  const response = await fetch('/api/settings', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Org-Id': orgId
    }
  });
  return response.json();
};

// Update org settings (admin/owner only)
const updateOrgSettings = async (orgId, settings) => {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Org-Id': orgId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(settings)
  });
  return response.json();
};
```

### **Frontend - User Settings**
```javascript
// Get personal settings
const getUserSettings = async () => {
  const response = await fetch('/api/settings/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return response.json();
};

// Update personal settings
const updateUserSettings = async (settings) => {
  const response = await fetch('/api/settings/me', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(settings)
  });
  return response.json();
};
```

---

## **🗂️ Database Schema**

### **Organization Settings Collection (`settings`)**
```typescript
{
  _id: ObjectId,
  sensorOfflineTimeOut: Number, // Required, min: 1
  orgId: ObjectId,             // Required, ref: 'Organization'
  createdAt: Date,
  updatedAt: Date
}
```

### **User Settings Collection (`user_settings`)**
```typescript
{
  _id: ObjectId,
  userId: ObjectId,           // Required, ref: 'User'
  defaultOrgId: ObjectId,     // Optional, ref: 'Organization'
  orgChoiceMode: String,      // Enum: 'remember' | 'ask-every-time'
  createdAt: Date,
  updatedAt: Date
}
```

---

## **🎯 Key Improvements Made:**

1. **✅ Proper Role Enforcement:** Only admins/owners can modify org settings
2. **✅ Organization Context:** Uses OrgContextGuard for proper multi-org support
3. **✅ Standardized Responses:** All endpoints return consistent response format
4. **✅ Auto-Creation:** Settings are created with defaults when first accessed
5. **✅ Clean Service:** Removed redundant methods, kept only essential ones
6. **✅ Type Safety:** Proper TypeScript types throughout
7. **✅ MongoDB Upsert:** User settings use efficient upsert operations

The settings module is now clean, efficient, and follows the same patterns as the rest of your multi-org platform! 🚀
