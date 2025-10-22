# Make User Admin - Instructions

## User to Make Admin
```
Email: pauledet339@gmail.com
Name: Paul Edet
User ID: nd7ffbzyzmgy2nqzmxccvnnsfs7sxdv2
Clerk ID: user_2y2E8f8jAQ7elOnhRkpJCxgSkqc
```

## Option 1: Using Convex Dashboard (Recommended - Fastest)

1. **Go to Convex Dashboard**
   - Visit: https://dashboard.convex.dev
   - Login to your account

2. **Select Production Deployment**
   - Click on deployment: **prod:adept-horse-443**

3. **Open Users Table**
   - Navigate to **Data** → **users** table

4. **Find the User**
   - Search for email: `pauledet339@gmail.com`
   - Or search by ID: `nd7ffbzyzmgy2nqzmxccvnnsfs7sxdv2`

5. **Edit the User Document**
   - Click on the user row to open the editor
   - Update these fields:
     ```json
     {
       "role": "admin",
       "onboarded": true
     }
     ```
   - Click **Save**

6. **Verify**
   - Refresh the table
   - Confirm `role` is now `"admin"`
   - Confirm `onboarded` is `true`

✅ **Done!** The user is now an admin.

---

## Option 2: Using Convex CLI

1. **Install Convex CLI** (if not installed)
   ```bash
   npm install -g convex
   ```

2. **Login to Convex**
   ```bash
   npx convex login
   ```

3. **Run in Convex Dev Console**
   ```bash
   npx convex dashboard
   ```
   
4. **In the Functions tab**, run this mutation:
   ```javascript
   // Select: internal.users.bootstrapAdmin
   {
     "userId": "nd7ffbzyzmgy2nqzmxccvnnsfs7sxdv2"
   }
   ```

---

## Option 3: Create Temporary Public Mutation

If you prefer automation, I can create a temporary public mutation that:
- Has a secret key for security
- Can be called once to bootstrap the admin
- Should be removed after use

Let me know if you want this option!

---

## Verification After Making Admin

1. **User can now access admin dashboard** at:
   - https://rehabifyhealth.com/dashboard/admin

2. **User has admin privileges** to:
   - Approve/decline user registrations
   - Manage all users and roles
   - View system analytics
   - Access all platform features

3. **Test Admin Access**:
   - Login with: pauledet339@gmail.com
   - Navigate to Admin Dashboard
   - Should see admin-only features

---

## Security Notes

⚠️ **Important**:
- Only make trusted users admins
- Admin role has full access to all data
- Consider using role-based permissions for specific tasks
- Regularly audit admin accounts

---

## Next Steps After Bootstrap

Once you have your first admin, you can:
1. Create more admins using the `setUserRole` mutation from admin dashboard
2. No longer need the `bootstrapAdmin` internal mutation
3. Remove or keep it for disaster recovery

---

## Quick Copy-Paste for Convex Dashboard

**Fields to update:**
```
role: admin
onboarded: true
```

**User to find:**
```
pauledet339@gmail.com
```
