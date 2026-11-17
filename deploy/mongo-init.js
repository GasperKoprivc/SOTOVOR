const database = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);
database.createUser({
  user: process.env.SOTOVOR_MONGO_APP_USER,
  pwd: process.env.SOTOVOR_MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: database.getName() }],
});
