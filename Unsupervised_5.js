// Define the Vellore district boundary
//var table = ee.FeatureCollection("projects/ee-utkarshwork13/assets/TAMILNADU_SUBDISTRICT_BDY");
var table = ee.FeatureCollection("projects/ee-sparshkumar-lst-crop/assets/TAMILNADU_SUBDISTRICT_BDY");
var vellore = table.filter(ee.Filter.eq('District', 'VELLORE'));

// Filter Sentinel-2 satellite imagery for the specific year
var image = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(vellore)
  .filterDate("2023-01-01", "2023-12-30")
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 1)
  .median()
  .clip(vellore);

// Calculate NDVI, NDWI, and EVI
var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
var evi = image.expression(
  '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
    'NIR': image.select('B8'),
    'RED': image.select('B4'),
    'BLUE': image.select('B2')
  }).rename('EVI');

// Filter Sentinel-1 SAR data for VV and VH bands
var sar = ee.ImageCollection("COPERNICUS/S1_GRD")
  .filterBounds(vellore)
  .filterDate("2023-07-01", "2023-10-30")
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .median()
  .clip(vellore);

// Rename SAR bands for VV and VH
var vv = sar.select('VV').rename('VV');
var vh = sar.select('VH').rename('VH');

// Combine bands and indices into a single image for clustering
var inputImage = image.select('B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8')
  .addBands([ndvi, ndwi, evi,]);

// Visualization parameters
var imageVisParam = {bands: ['B4', 'B3', 'B2'], min: 494.22, max: 2352.78, gamma: 2};
Map.addLayer(inputImage, imageVisParam, 'Sentinel-2 + SAR Image');

// Extract pixel values from the combined image
var samples = inputImage.sample({
  region: vellore,
  scale: 10,
  numPixels: 50000,
  tileScale: 4
});
print('Sample size:', samples.size());

// Define the number of clusters for KMeans
var numClusters = 50;

// Train a KMeans clustering model
var kmeansClusterer = ee.Clusterer.wekaKMeans(numClusters).train(samples);
var kmeansClusteredImage = inputImage.cluster(kmeansClusterer);

// Display KMeans clusters with unique colors
Map.addLayer(kmeansClusteredImage, {min: 1, max: numClusters, palette: ['purple', 'cyan', 'blue', 'green', 'yellow', 'red', 'orange', 'pink', 'brown', 'black']}, 'KMeans Clustered Image');

// Calculate intra-cluster variance as a proxy for accuracy
var kmeansStats = ee.List.sequence(1, numClusters).map(function(clusterID) {
  var clusterMask = kmeansClusteredImage.eq(ee.Image.constant(clusterID));
  var maskedInput = inputImage.updateMask(clusterMask);
  
  // Calculate the variance for each band within each cluster
  var variance = maskedInput.reduceRegion({
    reducer: ee.Reducer.variance(),
    geometry: vellore,
    scale: 10,
    maxPixels: 1e9
  });

  return ee.Dictionary({
    'Cluster': clusterID,
    'Variance_NDVI': variance.get('NDVI', null),
    'Variance_NDWI': variance.get('NDWI', null),
    'Variance_EVI': variance.get('EVI', null)
  });
});

// Convert KMeans variance stats to a feature collection for display
var kmeansStatsFC = ee.FeatureCollection(kmeansStats.map(function(stat) {
  return ee.Feature(null, stat);
}));
print('KMeans Cluster Stats (Variance per Cluster):', kmeansStatsFC);
  
// Calculate the mean variance for all clusters to assess clustering quality (lower mean variance indicates better clusters)
var meanVariance = kmeansStatsFC.aggregate_mean('Variance_NDVI');
print('Mean Variance of NDVI across clusters (proxy for accuracy):', meanVariance);

var meanVariance_NDWI = kmeansStatsFC.aggregate_mean('Variance_NDWI');
print('Mean Variance of NDWI across clusters (proxy for accuracy):', meanVariance_NDWI);


// Define multiple coordinates for points
var points = ee.Geometry.MultiPoint([
  [79.1842854, 12.979444],
  [79.175526, 12.979951],
  [79.175544, 12.979702],
  [79.175481, 12.979096],
  [79.175481, 12.978659]
]);

// Set visualization parameters for the markers
var pointStyle = {
  color: 'red',
  pointSize: 6,
  pointShape: 'circle',
  width: 2
};

// Add the points to the map as markers
Map.addLayer(points, pointStyle, 'Markers');

// Masking for different land cover types
// groundnut: Mask zero values
var groundnut = kmeansClusteredImage.eq(8).updateMask(kmeansClusteredImage.eq(8));
Map.addLayer(groundnut, {min: 0, max: 1, palette: ['green']}, 'groundnut');
///
// Sugarcane: Mask zero values
var sugarcane = kmeansClusteredImage.eq(35).updateMask(kmeansClusteredImage.eq(35));
Map.addLayer(sugarcane, {min: 0, max: 1, palette: ['yellow']}, 'sugarcane');

// Rice: Mask zero values
var rice = kmeansClusteredImage.eq(8).updateMask(kmeansClusteredImage.eq(8));
Map.addLayer(rice, {min: 0, max: 1, palette: ['red']}, 'rice');

// Sorgham: Mask zero values
var Sorgham = kmeansClusteredImage.eq(13).updateMask(kmeansClusteredImage.eq(13));
Map.addLayer(Sorgham, {min: 0, max: 1, palette: ['violet']}, 'Sorgham');

// marshes(grass_weed): Mask zero values
var grass_weed = kmeansClusteredImage.eq(8).updateMask(kmeansClusteredImage.eq(8));
Map.addLayer(grass_weed, {min: 0, max: 1, palette: ['pink']}, 'grass_weed');

// water_bodies: Mask zero values
var water_bodies = kmeansClusteredImage.eq(36).updateMask(kmeansClusteredImage.eq(36));
Map.addLayer(water_bodies, {min: 0, max: 1, palette: ['pink']}, 'water_bodies');
Map.centerObject(vellore, 10); 
