const { app, desktopCapturer } = require('electron');
app.whenReady().then(async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 640, height: 360 } });
  console.log('Sources found:', sources.length);
  if (sources.length > 0) {
    const thumb = sources[0].thumbnail;
    const jpeg = thumb.toJPEG(60);
    console.log('JPEG thumbnail size:', jpeg.length, 'bytes');
    const base64 = 'data:image/jpeg;base64,' + jpeg.toString('base64');
    console.log('Base64 sample prefix:', base64.substring(0, 50));
  }
  app.quit();
});
