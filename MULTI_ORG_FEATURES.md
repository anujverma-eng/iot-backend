# Motionics IoT Backend - Multi-Organization Features

This document outlines the multi-organization, invites, and permissions features that have been implemented in the Motionics IoT backend.

## Overview

The backend has been extended to support:
- Multiple organizations per user
- Invitation system with email notifications
- Fine-grained permissions per organization
- User preferences and settings
- Backward compatibility with existing single-org workflows

## New Features Implemented

### 1. Schemas & Models

#### Memberships (`src/module/memberships/memberships.schema.ts`)
- Links users to organizations with roles and permissions
- Supports ACTIVE, INVITED, SUSPENDED status
- Custom allow/deny permission arrays
- Indexed for performance

#### Invites (`src/module/invites/invites.schema.ts`)
- Secure token-based invitation system
- Email tracking (CREATED, SENT, DELIVERED, BOUNCED, etc.)
- 48-hour expiration
- Comprehensive status tracking

#### User Settings (`src/module/user-settings/user-settings.schema.ts`)
- Default organization preference
- Organization choice mode (remember vs ask-every-time)

### 2. Permission System

#### Permission Registry (`src/common/constants/permissions.ts`)
- Centralized permission definitions
- Role-based permission baselines
- Effective permission computation (baseline + allow - deny)
- Feature categories: Home, Sensors, Gateways, Telemetry, Organization

### 3. Authentication & Authorization

#### Updated JWT Strategy (`src/module/auth/jwt.strategy.ts`)
- Returns minimal user info (userId, sub, email)
- No longer includes org/role info (handled by OrgContextGuard)

#### Organization Context Guard (`src/auth/org-context.guard.ts`)
- Resolves organization context from route params, headers, or query
- Fetches user membership and computes effective permissions
- Handles single-org auto-selection
- Provides clear error messages for missing context

#### Updated Roles Guard (`src/module/auth/roles.guard.ts`)
- Reads role from request user (set by OrgContextGuard)
- No longer queries database directly

### 4. Services & Controllers

#### Memberships Service & Controller
- `GET /organizations/:orgId/members` - List members with pagination
- `PATCH /memberships/:id/role` - Update member role
- `PATCH /memberships/:id/permissions` - Update member permissions
- `DELETE /memberships/:id` - Remove member (soft delete)

#### Invites Service & Controller
- `POST /organizations/:orgId/invites` - Create and send invitation
- `GET /organizations/:orgId/invites` - List organization invites
- `DELETE /organizations/:orgId/invites/:token` - Revoke invitation
- `GET /invites/:token` - Get invite info (public)
- `POST /invites/:token/accept` - Accept invitation
- `POST /invites/:token/decline` - Decline invitation
- `GET /me/invites` - Get user's pending invitations

#### Updated Users Controller
- `GET /users/me` - Enhanced user info with memberships and permissions
- `PATCH /users/me` - Update user profile
- `POST /users/me/email/confirm` - Confirm email change
- `GET /users/me/preferences` - Get user preferences
- `PATCH /users/me/preferences` - Update user preferences

#### Updated Organizations Controller
- `POST /organizations` - Create organization (also creates owner membership)
- `GET /organizations/me` - Get current organization info
- `PATCH /organizations/:orgId` - Rename organization

### 5. Email System

#### Mail Service (`src/module/mail/mail.service.ts`)
- AWS SES v2 integration
- Template-based email sending
- Fallback HTML generation
- Message ID tracking for delivery status

### 6. Environment Configuration

Added environment variables:
- `SES_REGION` - AWS SES region
- `SES_FROM_EMAIL` - From email address (required)
- `SES_CONFIG_SET` - SES configuration set (optional)
- `FRONTEND_URL` - Frontend URL for invite links

## API Changes

### Multi-Organization Context

Most endpoints now support organization context resolution via:
1. Route parameter `:orgId`
2. Header `x-org-id`
3. Query parameter `orgId`

### New Headers

- `x-org-id: <orgId>` - Specify organization context

### Error Codes

New standardized error responses:
- `ORG_REQUIRED` (400) - Multiple orgs, org context required
- `INVITE_NOT_FOUND` (404) - Invalid invite token
- `INVITE_EXPIRED` (410) - Invite has expired
- `INVITE_REVOKED` (423) - Invite has been revoked
- `MEMBERSHIP_EXISTS` (409) - User already a member
- `FORBIDDEN` (403) - Insufficient permissions

## Backward Compatibility

- Existing endpoints continue to work for single-org users
- Legacy user.orgId field maintained for compatibility
- Existing controllers (sensors, gateways, telemetry) work unchanged
- Organization creation automatically creates owner membership

## Usage Examples

### Creating an Organization
```bash
POST /organizations
{
  "name": "My Company"
}
```

### Inviting a User
```bash
POST /organizations/507f1f77bcf86cd799439011/invites
{
  "email": "user@example.com",
  "role": "admin",
  "allow": ["sensors.delete"],
  "deny": ["org.billing"]
}
```

### Setting Organization Context
```bash
GET /sensors
X-Org-Id: 507f1f77bcf86cd799439011
```

### Accepting an Invite
```bash
POST /invites/abc123token/accept
Authorization: Bearer <jwt-token>
```

## Database Indexes

The following indexes have been added for performance:
- `memberships`: `{ userId: 1, orgId: 1 }` (unique)
- `memberships`: `{ orgId: 1, status: 1 }`
- `invites`: `{ token: 1 }` (unique)
- `invites`: `{ orgId: 1, email: 1 }`
- `invites`: `{ email: 1, status: 1 }`

## Security Considerations

- Invite tokens are 24-byte cryptographically random values
- Tokens are stored as base64url and never logged
- 48-hour expiration on invitations
- One owner per organization enforced
- Permission changes clear custom permissions when reducing roles
- Email verification required for invite acceptance

## Testing

To test the new features:

1. Create a new organization
2. Invite users with different roles
3. Test organization context resolution
4. Verify permission enforcement
5. Test email invitation flow

The implementation maintains full backward compatibility while adding powerful multi-organization capabilities.
