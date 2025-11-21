import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootPath = join(__dirname, '..', '..');
const envPath = join(rootPath, '.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cuu-ho-lu-lut';

async function fixGeoFeatureIndex() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('geofeatures');

        console.log('\n📋 Current indexes:');
        const indexes = await collection.indexes();
        indexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });

        // Xóa tất cả index liên quan đến geometry.coordinates
        console.log('\n🗑️  Removing old geospatial indexes...');
        try {
            await collection.dropIndex('geometry.coordinates_2dsphere');
            console.log('  ✅ Removed: geometry.coordinates_2dsphere');
        } catch (err) {
            if (err.code === 27) {
                console.log('  ℹ️  Index geometry.coordinates_2dsphere does not exist');
            } else {
                console.log('  ⚠️  Error removing index:', err.message);
            }
        }

        // Tạo lại partial index chỉ cho Point
        console.log('\n📝 Creating new partial index for Point geometry only...');
        await collection.createIndex(
            { 'geometry.coordinates': '2dsphere' },
            { 
                partialFilterExpression: { 'geometry.type': 'Point' },
                name: 'geometry_coordinates_2dsphere_point_only'
            }
        );
        console.log('  ✅ Created: geometry_coordinates_2dsphere_point_only (partial index for Point only)');

        console.log('\n📋 Updated indexes:');
        const newIndexes = await collection.indexes();
        newIndexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
            if (idx.partialFilterExpression) {
                console.log(`    Partial filter: ${JSON.stringify(idx.partialFilterExpression)}`);
            }
        });

        console.log('\n✅ Index fix completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixGeoFeatureIndex();

