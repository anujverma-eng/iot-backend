import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Model } from 'mongoose';
import { User, UserDocument } from '../src/module/users/users.schema';
import { Membership, MembershipDocument, MembershipStatus } from '../src/module/memberships/memberships.schema';
import { UserRole } from '../src/module/users/enums/users.enum';

/**
 * Migration script to create memberships for existing users
 * This ensures backward compatibility with the legacy single-org system
 * 
 * Usage: npm run migrate:legacy-users
 */
async function migrateLegacyUsersToMemberships() {
  console.log('Starting migration: Creating memberships for legacy users...');

  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    // Get models directly from the connection
    const connection = app.get('DatabaseConnection');
    const userModel = connection.model('User') as Model<UserDocument>;
    const membershipModel = connection.model('Membership') as Model<MembershipDocument>;

    // Find users with orgId but no corresponding membership
    const usersWithOrgs = await userModel.find({
      orgId: { $exists: true, $ne: null }
    }).lean();

    console.log(`Found ${usersWithOrgs.length} users with organization assignments`);

    let created = 0;
    let skipped = 0;

    for (const user of usersWithOrgs) {
      try {
        // Check if membership already exists
        const existingMembership = await membershipModel.findOne({
          userId: user._id,
          orgId: user.orgId
        });

        if (existingMembership) {
          console.log(`Membership already exists for user ${user.email}`);
          skipped++;
          continue;
        }

        // Create membership
        await membershipModel.create({
          userId: user._id,
          orgId: user.orgId,
          role: user.role || UserRole.MEMBER,
          status: MembershipStatus.ACTIVE,
          acceptedAt: new Date(),
          allow: [],
          deny: []
        });

        console.log(`✓ Created membership for user ${user.email} as ${user.role} in org ${user.orgId}`);
        created++;
      } catch (error) {
        console.error(`✗ Failed to create membership for user ${user.email}:`, error.message);
      }
    }

    console.log(`Migration completed! Created: ${created}, Skipped: ${skipped}`);
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  migrateLegacyUsersToMemberships()
    .then(() => {
      console.log('Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateLegacyUsersToMemberships };
