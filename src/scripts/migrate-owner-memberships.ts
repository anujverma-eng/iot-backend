import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User, UserDocument } from '../module/users/users.schema';
import { Membership, MembershipDocument, MembershipStatus } from '../module/memberships/memberships.schema';
import { Organization, OrganizationDocument } from '../module/organizations/organizations.schema';
import { UserRole } from '../module/users/enums/users.enum';

/**
 * Migration script to create memberships for existing owner users
 * This script finds all users with role 'OWNER' who have an orgId but no corresponding membership
 * and creates the appropriate membership records for them.
 * 
 * Usage: 
 *   npm run migrate:owner-memberships           # Run the migration
 *   DRY_RUN=true npm run migrate:owner-memberships  # Preview what would be migrated
 */

// Check for dry run mode
const isDryRun = process.env.DRY_RUN === 'true';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  
  if (isDryRun) {
    console.log('� Running in DRY RUN mode - no data will be modified');
  }
  console.log('�🚀 Starting owner membership migration...');

  try {
    // Get models
    const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    const membershipModel = app.get<Model<MembershipDocument>>(getModelToken(Membership.name));
    const orgModel = app.get<Model<OrganizationDocument>>(getModelToken(Organization.name));

    // 1️⃣ Find all users with role OWNER who have an orgId
    const ownerUsers = await userModel.find({
      role: UserRole.OWNER,
      orgId: { $exists: true, $ne: null }
    }).lean();

    console.log(`📊 Found ${ownerUsers.length} owner users with orgId`);

    if (ownerUsers.length === 0) {
      console.log('✅ No owner users found. Migration complete.');
      process.exit(0);
    }

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const toCreate: any[] = [];

    // 2️⃣ Process each owner user
    for (const user of ownerUsers) {
      try {
        // Check if membership already exists
        const existingMembership = await membershipModel.findOne({
          userId: user._id,
          orgId: user.orgId
        });

        if (existingMembership) {
          console.log(`⏭️  Membership already exists for user ${user.email} in org ${user.orgId}`);
          skippedCount++;
          continue;
        }

        // Verify organization exists
        const organization = await orgModel.findById(user.orgId);
        if (!organization) {
          console.log(`⚠️  Organization ${user.orgId} not found for user ${user.email}. Skipping.`);
          errorCount++;
          continue;
        }

        // 3️⃣ Prepare membership record
        const membershipData = {
          userId: user._id,
          orgId: user.orgId,
          role: UserRole.OWNER,
          allow: [], // Will be populated by permission system
          deny: [],
          status: MembershipStatus.ACTIVE,
          acceptedAt: new Date() // Set as already accepted since these are existing owners
        };

        if (isDryRun) {
          console.log(`🔍 [DRY RUN] Would create membership for user ${user.email} (${user._id}) in org ${organization.name} (${user.orgId})`);
          toCreate.push({ user: user.email, org: organization.name, membershipData });
        } else {
          await membershipModel.create(membershipData);
          console.log(`✅ Created membership for user ${user.email} (${user._id}) in org ${organization.name} (${user.orgId})`);
        }
        
        createdCount++;

      } catch (error) {
        console.error(`❌ Error processing user ${user.email}:`, error.message);
        errorCount++;
      }
    }

    // 4️⃣ Summary
    console.log('\n📈 Migration Summary:');
    if (isDryRun) {
      console.log(`🔍 Would create memberships: ${createdCount}`);
      console.log(`⏭️  Already exist (would skip): ${skippedCount}`);
      console.log(`❌ Errors encountered: ${errorCount}`);
      console.log(`📊 Total processed: ${ownerUsers.length}`);
      
      if (toCreate.length > 0) {
        console.log('\n📋 Summary of memberships that would be created:');
        toCreate.forEach((item, index) => {
          console.log(`${index + 1}. ${item.user} → ${item.org}`);
        });
        console.log('\n💡 Run without DRY_RUN=true to execute the migration');
      }
    } else {
      console.log(`✅ Created memberships: ${createdCount}`);
      console.log(`⏭️  Skipped (already exists): ${skippedCount}`);
      console.log(`❌ Errors: ${errorCount}`);
      console.log(`📊 Total processed: ${ownerUsers.length}`);

      if (createdCount > 0) {
        console.log('\n🎉 Owner membership migration completed successfully!');
      } else {
        console.log('\n✅ No new memberships needed to be created.');
      }
    }

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

// Run the migration
bootstrap().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
