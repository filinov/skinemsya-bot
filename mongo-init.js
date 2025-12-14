// mongo-init.js
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'admin');

// Проверяем, существует ли root пользователь, иначе создаем (для подстраховки)
if (!db.getUser(process.env.MONGO_ROOT_USER || 'root')) {
  db.createUser({
    user: process.env.MONGO_ROOT_USER || 'root',
    pwd: process.env.MONGO_ROOT_PASSWORD,
    roles: ["root"]
  });
  print('✅ Root user created or updated');
}

// Переключаемся на базу данных приложения и создаем её пользователя
db = db.getSiblingDB(process.env.MONGO_DATABASE || 'skinemsya-bot');

db.createUser({
  user: process.env.MONGO_USER || 'botuser',
  pwd: process.env.MONGO_PASSWORD,
  roles: [
    { role: "readWrite", db: process.env.MONGO_DATABASE || 'skinemsya-bot' }
  ]
});
print('✅ Application database and user created');