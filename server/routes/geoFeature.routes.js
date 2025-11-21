import express from 'express';
import {
    getGeoFeatures,
    getGeoFeatureById,
    createGeoFeature,
    updateGeoFeature,
    deleteGeoFeature,
    getFeatureCollection
} from '../controllers/geoFeature.controller.js';

const router = express.Router();

/**
 * Routes cho GeoFeatures
 */

// Lấy FeatureCollection (cho frontend render)
router.get('/feature-collection', getFeatureCollection);

// CRUD operations
router.get('/', getGeoFeatures);
router.get('/:id', getGeoFeatureById);
router.post('/', createGeoFeature);
router.put('/:id', updateGeoFeature);
router.delete('/:id', deleteGeoFeature);

export default router;

