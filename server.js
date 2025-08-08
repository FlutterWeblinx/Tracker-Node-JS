const net = require('net');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-key.json');

const PORT = 5055;

// ✅ Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://teltonik-50ccd-default-rtdb.firebaseio.com',
});

const db = admin.database();

// 🚀 Create TCP Server
const server = net.createServer(socket => {
  console.log(`Device connected from ${socket.remoteAddress}`);

  socket.on('data', data => {
    const hexData = data.toString('hex');
    console.log('Hex Data:', hexData);

    if (data.length === 17) {
      const imei = data.slice(2).toString();
      console.log('Received IMEI:', imei);
      socket.write(Buffer.from([0x01])); // ACK for IMEI
    } else {
      parseAVLData(data, socket.remoteAddress);
      socket.write(Buffer.from([0x00, 0x00, 0x00, 0x01])); // ACK AVL
    }
  });

  socket.on('close', () => {
    console.log('Connection closed');
  });

  socket.on('error', err => {
    console.error('Socket error:', err.message);
  });
});

server.listen(PORT, () => {
  console.log(`✅ FMB920 Server listening on port ${PORT}`);
});

// ✅ Parse and Save AVL Data to Firebase
function parseAVLData(buffer, ipAddress) {
  const dataLength = buffer.readUInt32BE(0);
  const codecId = buffer[4];
  const recordCount = buffer[5];

  let offset = 6;

  // 🕒 Safe Timestamp Parsing
  const timestampRaw = buffer.readBigUInt64BE(offset);
  let timestamp;

  try {
    timestamp = new Date(Number(timestampRaw)); // assume ms
    if (isNaN(timestamp.getTime())) throw new Error('Invalid timestamp');
  } catch {
    timestamp = new Date(Number(timestampRaw / 1000n)); // fallback to sec
  }

  offset += 8;

  const priority = buffer[offset];
  offset += 1;

  const longitude = buffer.readInt32BE(offset) / 10000000;
  offset += 4;

  const latitude = buffer.readInt32BE(offset) / 10000000;
  offset += 4;

  const altitude = buffer.readInt16BE(offset);
  offset += 2;

  const angle = buffer.readInt16BE(offset);
  offset += 2;

  const satellites = buffer[offset];
  offset += 1;

  const speed = buffer.readUInt16BE(offset);
  offset += 2;

  const gpsData = {
    timestamp: timestamp.toISOString(),
    latitude,
    longitude,
    altitude,
    angle,
    satellites,
    speed,
  };

  console.log('📍 GPS Record Received:', gpsData);

  // ✅ Clean IP to use as Firebase path key (remove ., :, etc.)
  const ipKey = ipAddress
    .replace(/[:.]/g, '_') // replace forbidden chars
    .replace(/^_+/, '');   // remove leading underscores

  db.ref(`devices/${ipKey}`)
  .push(gpsData)
  .then(() => console.log(`✅ Data saved for ${ipKey}`))
  .catch(err => console.error('❌ Firebase error:', err));


}
