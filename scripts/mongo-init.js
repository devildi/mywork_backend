// MongoDB initialization script
db = db.getSiblingDB('davinci');

// Create the application database user
db.createUser({
  user: 'woody',
  pwd: '41538bc6dd',
  roles: [
    {
      role: 'dbOwner',
      db: 'davinci'
    }
  ]
});

console.log('MongoDB initialization: created user woody on database davinci.');
