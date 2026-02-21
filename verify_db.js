const mysql = require('mysql2/promise');

async function testConnection(usernameVariant, description) {
  console.log(`\n--- Testing TiDB Connection: ${description} (${usernameVariant}) ---`);

  const config = {
    host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    user: usernameVariant,
    password: 'HZ8OtBgVGXFxLcOt', // Confirmed Password
    database: 'test',
    port: 4000,
    ssl: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: false
    }
  };

  try {
    const connection = await mysql.createConnection(config);
    console.log(`✅ SUCCESS! Connected with ${description}!`);
    await connection.end();
    return true;
  } catch (error) {
    console.log(`❌ Failed with ${description}: Access Denied (or other error)`);
    // console.error(error.message); 
    return false;
  }
}

async function runTests() {
  // Variation 1: Lowercase L (Original)
  if (await testConnection('2aJL2J6QqlbSD35.root', 'Lowercase L')) return;

  // Variation 2: Uppercase I (Visual match)
  if (await testConnection('2aJL2J6QqIbSD35.root', 'Uppercase I')) return;

  // Variation 3: Lowercase i (User typed)
  if (await testConnection('2aJL2J6QqibSD35.root', 'Lowercase i')) return;

  console.log('\n❌ ALL VARIATIONS FAILED. Time to switch services.');
}

runTests();
