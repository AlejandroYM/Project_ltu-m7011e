// services/recipe-service/seed.js
// Ejecutar con: node seed.js
// O desde el pod: kubectl exec -it -n chefmatch deployment/recipe-service -- node /app/seed.js

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const mongoose = require('mongoose');
const Recipe = require('./models/Recipe');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo-service:27017/chefmatch';

const seedRecipes = [
  // ── ITALIAN (8 nuevas) ──────────────────────────────────────────
  { name: 'Risotto ai Funghi', category: 'Italian', description: 'Creamy mushroom risotto with parmesan.', ingredients: ['Arborio rice', 'Porcini mushrooms', 'Parmesan', 'White wine', 'Vegetable broth'], instructions: '1. Sauté mushrooms.\n2. Toast rice and deglaze with wine.\n3. Add broth ladle by ladle.\n4. Finish with parmesan and butter.', cookingTime: 35, userId: 'seed' },
  { name: 'Lasagna Bolognese', category: 'Italian', description: 'Classic layered pasta with meat sauce.', ingredients: ['Lasagna sheets', 'Ground beef', 'Béchamel sauce', 'Tomato sauce', 'Parmesan'], instructions: '1. Make bolognese sauce.\n2. Make béchamel.\n3. Layer pasta, bolognese, béchamel.\n4. Bake 45 min at 180°C.', cookingTime: 90, userId: 'seed' },
  { name: 'Gnocchi al Pesto', category: 'Italian', description: 'Potato gnocchi with fresh basil pesto.', ingredients: ['Potato gnocchi', 'Fresh basil', 'Pine nuts', 'Parmesan', 'Olive oil'], instructions: '1. Blend basil, pine nuts, parmesan and oil.\n2. Cook gnocchi until they float.\n3. Toss with pesto and serve.', cookingTime: 25, userId: 'seed' },
  { name: 'Ossobuco Milanese', category: 'Italian', description: 'Braised veal shanks Milanese style.', ingredients: ['Veal shanks', 'White wine', 'Gremolata', 'Onion', 'Carrot'], instructions: '1. Brown the veal shanks.\n2. Add wine and vegetables.\n3. Braise 2 hours covered.\n4. Serve with gremolata.', cookingTime: 130, userId: 'seed' },
  { name: 'Penne Arrabbiata', category: 'Italian', description: 'Spicy tomato pasta.', ingredients: ['Penne', 'San Marzano tomatoes', 'Red chili', 'Garlic', 'Olive oil'], instructions: '1. Sauté garlic and chili.\n2. Add crushed tomatoes.\n3. Cook sauce 15 min.\n4. Toss with al dente pasta.', cookingTime: 25, userId: 'seed' },
  { name: 'Saltimbocca alla Romana', category: 'Italian', description: 'Veal with prosciutto and sage.', ingredients: ['Veal escalopes', 'Prosciutto', 'Fresh sage', 'White wine', 'Butter'], instructions: '1. Top veal with prosciutto and sage.\n2. Secure with toothpick.\n3. Pan fry 2 min each side.\n4. Deglaze with white wine.', cookingTime: 20, userId: 'seed' },
  { name: 'Focaccia Genovese', category: 'Italian', description: 'Fluffy Ligurian flatbread.', ingredients: ['Bread flour', 'Olive oil', 'Sea salt', 'Rosemary', 'Yeast'], instructions: '1. Make dough and rest 2 hours.\n2. Stretch into pan.\n3. Dimple with fingers, add oil and salt.\n4. Bake 25 min at 220°C.', cookingTime: 150, userId: 'seed' },
  { name: 'Bruschetta al Pomodoro', category: 'Italian', description: 'Toasted bread with fresh tomatoes.', ingredients: ['Sourdough bread', 'Cherry tomatoes', 'Fresh basil', 'Garlic', 'Olive oil'], instructions: '1. Toast bread slices.\n2. Rub with raw garlic.\n3. Top with diced tomatoes and basil.\n4. Drizzle with olive oil.', cookingTime: 10, userId: 'seed' },

  // ── MEXICAN (8 nuevas) ──────────────────────────────────────────
  { name: 'Enchiladas Verdes', category: 'Mexican', description: 'Tortillas filled with chicken in green salsa.', ingredients: ['Corn tortillas', 'Chicken breast', 'Tomatillo salsa', 'Sour cream', 'Queso fresco'], instructions: '1. Cook and shred chicken.\n2. Fill tortillas and roll.\n3. Cover with green salsa.\n4. Bake 20 min and top with cream and cheese.', cookingTime: 45, userId: 'seed' },
  { name: 'Pozole Rojo', category: 'Mexican', description: 'Hominy corn soup with pork.', ingredients: ['Hominy corn', 'Pork shoulder', 'Guajillo chili', 'Oregano', 'Cabbage'], instructions: '1. Cook pork until tender.\n2. Make chili broth.\n3. Combine with hominy.\n4. Serve with shredded cabbage and oregano.', cookingTime: 120, userId: 'seed' },
  { name: 'Chiles Rellenos', category: 'Mexican', description: 'Stuffed poblano peppers in tomato sauce.', ingredients: ['Poblano peppers', 'Oaxaca cheese', 'Eggs', 'Tomato sauce', 'Flour'], instructions: '1. Roast and peel peppers.\n2. Stuff with cheese.\n3. Coat in egg batter and fry.\n4. Serve in tomato sauce.', cookingTime: 50, userId: 'seed' },
  { name: 'Cochinita Pibil', category: 'Mexican', description: 'Slow-cooked achiote pork from Yucatan.', ingredients: ['Pork shoulder', 'Achiote paste', 'Orange juice', 'Banana leaves', 'Pickled onion'], instructions: '1. Marinate pork in achiote and citrus overnight.\n2. Wrap in banana leaves.\n3. Slow cook 4 hours at 160°C.\n4. Shred and serve with pickled onion.', cookingTime: 250, userId: 'seed' },
  { name: 'Sopa de Lima', category: 'Mexican', description: 'Yucatan lime soup with chicken.', ingredients: ['Chicken broth', 'Chicken breast', 'Lime juice', 'Corn tortillas', 'Avocado'], instructions: '1. Cook chicken in broth.\n2. Shred chicken and return to broth.\n3. Add lime juice.\n4. Serve with fried tortilla strips and avocado.', cookingTime: 40, userId: 'seed' },
  { name: 'Tamales de Rajas', category: 'Mexican', description: 'Corn dough tamales with poblano strips.', ingredients: ['Masa harina', 'Lard', 'Poblano strips', 'Corn husks', 'Oaxaca cheese'], instructions: '1. Soak corn husks.\n2. Make masa with lard and broth.\n3. Spread masa, add filling, fold.\n4. Steam 1 hour.', cookingTime: 90, userId: 'seed' },
  { name: 'Quesadillas de Flor de Calabaza', category: 'Mexican', description: 'Squash blossom quesadillas.', ingredients: ['Corn tortillas', 'Squash blossoms', 'Oaxaca cheese', 'Epazote', 'Salsa verde'], instructions: '1. Clean the blossoms.\n2. Fill tortillas with cheese and blossoms.\n3. Cook on griddle until cheese melts.\n4. Serve with green salsa.', cookingTime: 15, userId: 'seed' },
  { name: 'Mole Negro', category: 'Mexican', description: 'Complex dark mole with turkey.', ingredients: ['Turkey leg', 'Mulato chilies', 'Chocolate', 'Plantain', 'Sesame seeds'], instructions: '1. Toast and soak chilies.\n2. Blend with chocolate and spices.\n3. Fry mole paste.\n4. Cook turkey in mole sauce 1 hour.', cookingTime: 180, userId: 'seed' },

  // ── VEGAN (8 nuevas) ──────────────────────────────────────────
  { name: 'Lentil Dal', category: 'Vegan', description: 'Indian spiced red lentil soup.', ingredients: ['Red lentils', 'Coconut milk', 'Turmeric', 'Cumin', 'Ginger'], instructions: '1. Sauté spices in oil.\n2. Add lentils and broth.\n3. Cook 20 min.\n4. Stir in coconut milk.', cookingTime: 30, userId: 'seed' },
  { name: 'Mushroom Tacos', category: 'Vegan', description: 'Crispy portobello mushroom tacos.', ingredients: ['Portobello mushrooms', 'Corn tortillas', 'Avocado', 'Lime', 'Chipotle'], instructions: '1. Marinate mushrooms in chipotle.\n2. Grill until charred.\n3. Warm tortillas.\n4. Assemble with avocado and lime.', cookingTime: 25, userId: 'seed' },
  { name: 'Falafel Wrap', category: 'Vegan', description: 'Crispy chickpea balls in flatbread.', ingredients: ['Chickpeas', 'Flatbread', 'Hummus', 'Cucumber', 'Fresh parsley'], instructions: '1. Blend chickpeas with herbs and spices.\n2. Form balls and fry until golden.\n3. Spread hummus on flatbread.\n4. Add falafel and vegetables.', cookingTime: 35, userId: 'seed' },
  { name: 'Vegetable Paella', category: 'Vegan', description: 'Spanish rice with seasonal vegetables.', ingredients: ['Bomba rice', 'Bell peppers', 'Artichokes', 'Saffron', 'Vegetable broth'], instructions: '1. Sauté vegetables in paella pan.\n2. Add rice and saffron.\n3. Pour hot broth and do not stir.\n4. Cook until socarrat forms.', cookingTime: 50, userId: 'seed' },
  { name: 'Stuffed Bell Peppers', category: 'Vegan', description: 'Peppers filled with quinoa and vegetables.', ingredients: ['Bell peppers', 'Quinoa', 'Black beans', 'Corn', 'Tomato sauce'], instructions: '1. Cook quinoa.\n2. Mix with beans and corn.\n3. Fill peppers with mixture.\n4. Bake 30 min at 180°C.', cookingTime: 50, userId: 'seed' },
  { name: 'Tofu Stir Fry', category: 'Vegan', description: 'Crispy tofu with vegetables in soy sauce.', ingredients: ['Firm tofu', 'Broccoli', 'Snap peas', 'Soy sauce', 'Sesame oil'], instructions: '1. Press and cube tofu.\n2. Fry tofu until golden.\n3. Stir fry vegetables.\n4. Combine with sauce and serve over rice.', cookingTime: 25, userId: 'seed' },
  { name: 'Cauliflower Curry', category: 'Vegan', description: 'Roasted cauliflower in tomato curry.', ingredients: ['Cauliflower', 'Canned tomatoes', 'Garam masala', 'Garlic', 'Ginger'], instructions: '1. Roast cauliflower florets.\n2. Make curry sauce with tomatoes and spices.\n3. Add cauliflower to sauce.\n4. Simmer 15 min and serve with rice.', cookingTime: 40, userId: 'seed' },
  { name: 'Avocado Toast Deluxe', category: 'Vegan', description: 'Sourdough with smashed avocado and toppings.', ingredients: ['Sourdough bread', 'Avocado', 'Cherry tomatoes', 'Microgreens', 'Lemon'], instructions: '1. Toast sourdough slices.\n2. Smash avocado with lemon and salt.\n3. Spread on toast.\n4. Top with tomatoes and microgreens.', cookingTime: 10, userId: 'seed' },

  // ── JAPANESE (8 nuevas) ──────────────────────────────────────────
  { name: 'Tonkatsu', category: 'Japanese', description: 'Breaded pork cutlet with tonkatsu sauce.', ingredients: ['Pork loin', 'Panko breadcrumbs', 'Egg', 'Cabbage', 'Tonkatsu sauce'], instructions: '1. Pound pork thin.\n2. Coat in flour, egg, panko.\n3. Deep fry until golden.\n4. Serve with shredded cabbage and sauce.', cookingTime: 25, userId: 'seed' },
  { name: 'Gyoza', category: 'Japanese', description: 'Pan-fried pork and cabbage dumplings.', ingredients: ['Gyoza wrappers', 'Ground pork', 'Cabbage', 'Ginger', 'Soy sauce'], instructions: '1. Mix filling ingredients.\n2. Fill and fold wrappers.\n3. Pan fry until bottoms are golden.\n4. Add water and steam until cooked.', cookingTime: 40, userId: 'seed' },
  { name: 'Miso Ramen', category: 'Japanese', description: 'Rich miso broth ramen with toppings.', ingredients: ['Ramen noodles', 'Miso paste', 'Pork belly', 'Soft boiled egg', 'Corn'], instructions: '1. Make rich pork broth.\n2. Whisk in miso paste.\n3. Cook noodles separately.\n4. Assemble with pork, egg and corn.', cookingTime: 90, userId: 'seed' },
  { name: 'Yakitori', category: 'Japanese', description: 'Grilled chicken skewers with tare sauce.', ingredients: ['Chicken thighs', 'Tare sauce', 'Spring onion', 'Bamboo skewers', 'Sake'], instructions: '1. Cut chicken into chunks.\n2. Thread on skewers with onion.\n3. Grill brushing with tare sauce.\n4. Finish with extra sauce.', cookingTime: 25, userId: 'seed' },
  { name: 'Tempura Udon', category: 'Japanese', description: 'Thick noodle soup with crispy tempura.', ingredients: ['Udon noodles', 'Dashi broth', 'Shrimp', 'Tempura batter', 'Soy sauce'], instructions: '1. Make dashi broth with soy and mirin.\n2. Make cold tempura batter.\n3. Fry shrimp tempura.\n4. Serve udon in broth topped with tempura.', cookingTime: 35, userId: 'seed' },
  { name: 'Karaage', category: 'Japanese', description: 'Japanese fried chicken, crispy and juicy.', ingredients: ['Chicken thighs', 'Soy sauce', 'Mirin', 'Ginger', 'Potato starch'], instructions: '1. Marinate chicken in soy, mirin and ginger.\n2. Coat in potato starch.\n3. Double fry for extra crunch.\n4. Serve with mayo and lemon.', cookingTime: 30, userId: 'seed' },
  { name: 'Okonomiyaki', category: 'Japanese', description: 'Savory Japanese pancake with cabbage.', ingredients: ['Cabbage', 'Flour', 'Eggs', 'Pork belly', 'Okonomiyaki sauce'], instructions: '1. Mix batter with shredded cabbage.\n2. Add pork on top.\n3. Cook on griddle flipping once.\n4. Top with sauce, mayo and bonito flakes.', cookingTime: 20, userId: 'seed' },
  { name: 'Beef Teriyaki Bowl', category: 'Japanese', description: 'Glazed beef slices over steamed rice.', ingredients: ['Beef sirloin', 'Teriyaki sauce', 'Steamed rice', 'Sesame seeds', 'Spring onion'], instructions: '1. Slice beef thin.\n2. Sear in hot pan.\n3. Add teriyaki sauce and glaze.\n4. Serve over rice with sesame and onion.', cookingTime: 20, userId: 'seed' },

  // ── AMERICAN (8 nuevas) ──────────────────────────────────────────
  { name: 'Mac and Cheese', category: 'American', description: 'Creamy baked macaroni and cheese.', ingredients: ['Macaroni', 'Cheddar cheese', 'Milk', 'Butter', 'Breadcrumbs'], instructions: '1. Make cheese sauce with butter, flour and milk.\n2. Add cheese until melted.\n3. Mix with cooked pasta.\n4. Top with breadcrumbs and bake 20 min.', cookingTime: 40, userId: 'seed' },
  { name: 'Buffalo Wings', category: 'American', description: 'Crispy chicken wings in hot sauce.', ingredients: ['Chicken wings', 'Hot sauce', 'Butter', 'Blue cheese dip', 'Celery'], instructions: '1. Bake wings at 220°C until crispy.\n2. Toss in hot sauce and butter.\n3. Serve with blue cheese dip and celery.', cookingTime: 50, userId: 'seed' },
  { name: 'Philly Cheesesteak', category: 'American', description: 'Steak sandwich with melted cheese.', ingredients: ['Ribeye steak', 'Hoagie roll', 'Provolone cheese', 'Onion', 'Green pepper'], instructions: '1. Slice steak very thin.\n2. Cook with onion and pepper.\n3. Top with cheese to melt.\n4. Load into toasted hoagie roll.', cookingTime: 25, userId: 'seed' },
  { name: 'Clam Chowder', category: 'American', description: 'New England creamy clam soup.', ingredients: ['Clams', 'Potatoes', 'Bacon', 'Heavy cream', 'Onion'], instructions: '1. Cook bacon until crispy.\n2. Sauté onion in bacon fat.\n3. Add potatoes and clam juice.\n4. Stir in cream and clams.', cookingTime: 40, userId: 'seed' },
  { name: 'Pulled Pork Sandwich', category: 'American', description: 'Slow-cooked pulled pork on brioche.', ingredients: ['Pork shoulder', 'BBQ sauce', 'Brioche bun', 'Coleslaw', 'Pickles'], instructions: '1. Rub pork with spices.\n2. Slow cook 8 hours at 120°C.\n3. Shred and mix with BBQ sauce.\n4. Serve on bun with coleslaw.', cookingTime: 480, userId: 'seed' },
  { name: 'Corn Dog', category: 'American', description: 'Hot dogs coated in cornbread batter.', ingredients: ['Hot dogs', 'Cornmeal', 'Flour', 'Egg', 'Mustard'], instructions: '1. Make cornbread batter.\n2. Skewer hot dogs.\n3. Dip in batter and deep fry.\n4. Serve with mustard and ketchup.', cookingTime: 20, userId: 'seed' },
  { name: 'Lobster Roll', category: 'American', description: 'New England lobster in a buttered roll.', ingredients: ['Lobster meat', 'Hot dog bun', 'Mayonnaise', 'Celery', 'Lemon'], instructions: '1. Cook lobster and chop meat.\n2. Mix with mayo, celery and lemon.\n3. Toast bun with butter.\n4. Fill with lobster mixture.', cookingTime: 30, userId: 'seed' },
  { name: 'Chicken and Waffles', category: 'American', description: 'Crispy fried chicken on fluffy waffles.', ingredients: ['Chicken thighs', 'Waffle batter', 'Maple syrup', 'Hot sauce', 'Butter'], instructions: '1. Marinate chicken in buttermilk.\n2. Coat in seasoned flour and fry.\n3. Make waffles.\n4. Serve chicken on waffles with maple syrup.', cookingTime: 45, userId: 'seed' },

  // ── DESSERTS (8 nuevas) ──────────────────────────────────────────
  { name: 'Crème Brûlée', category: 'Desserts', description: 'Classic French custard with caramel top.', ingredients: ['Heavy cream', 'Egg yolks', 'Sugar', 'Vanilla bean', 'Brown sugar'], instructions: '1. Heat cream with vanilla.\n2. Mix with yolks and sugar.\n3. Bake in water bath 45 min.\n4. Chill, then torch sugar top.', cookingTime: 60, userId: 'seed' },
  { name: 'Chocolate Lava Cake', category: 'Desserts', description: 'Warm chocolate cake with molten center.', ingredients: ['Dark chocolate', 'Butter', 'Eggs', 'Sugar', 'Flour'], instructions: '1. Melt chocolate and butter.\n2. Whisk in eggs and sugar.\n3. Fold in flour.\n4. Bake 12 min — center stays molten.', cookingTime: 20, userId: 'seed' },
  { name: 'Panna Cotta', category: 'Desserts', description: 'Italian cream dessert with berry coulis.', ingredients: ['Heavy cream', 'Gelatin', 'Sugar', 'Vanilla', 'Mixed berries'], instructions: '1. Heat cream with sugar and vanilla.\n2. Dissolve gelatin and mix in.\n3. Pour into molds and chill 4 hours.\n4. Serve with berry coulis.', cookingTime: 20, userId: 'seed' },
  { name: 'Apple Pie', category: 'Desserts', description: 'Classic American apple pie.', ingredients: ['Pie crust', 'Granny Smith apples', 'Cinnamon', 'Brown sugar', 'Butter'], instructions: '1. Make or buy pie crust.\n2. Slice apples and mix with sugar and cinnamon.\n3. Fill crust and top with lattice.\n4. Bake 50 min at 190°C.', cookingTime: 90, userId: 'seed' },
  { name: 'Profiteroles', category: 'Desserts', description: 'Choux pastry with cream and chocolate.', ingredients: ['Choux pastry', 'Whipped cream', 'Dark chocolate', 'Butter', 'Icing sugar'], instructions: '1. Make choux and pipe balls.\n2. Bake until golden and hollow.\n3. Fill with whipped cream.\n4. Drizzle with melted chocolate.', cookingTime: 50, userId: 'seed' },
  { name: 'Churros con Chocolate', category: 'Desserts', description: 'Fried dough sticks with hot chocolate dip.', ingredients: ['Flour', 'Water', 'Salt', 'Dark chocolate', 'Sugar and cinnamon'], instructions: '1. Make thick choux dough.\n2. Pipe and fry in hot oil.\n3. Roll in cinnamon sugar.\n4. Serve with thick hot chocolate for dipping.', cookingTime: 30, userId: 'seed' },
  { name: 'Mango Sorbet', category: 'Desserts', description: 'Refreshing mango sorbet, dairy free.', ingredients: ['Ripe mangoes', 'Sugar syrup', 'Lime juice', 'Mint'], instructions: '1. Blend mango with syrup and lime.\n2. Churn in ice cream machine.\n3. Freeze 2 hours.\n4. Serve with fresh mint.', cookingTime: 20, userId: 'seed' },
  { name: 'Banana Foster', category: 'Desserts', description: 'Caramelized bananas with rum and ice cream.', ingredients: ['Bananas', 'Brown sugar', 'Rum', 'Butter', 'Vanilla ice cream'], instructions: '1. Melt butter and brown sugar.\n2. Add banana halves.\n3. Add rum and flambé.\n4. Serve immediately over ice cream.', cookingTime: 15, userId: 'seed' }
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Evitar duplicados — solo insertar si no existe
    let inserted = 0;
    for (const recipe of seedRecipes) {
      const exists = await Recipe.findOne({ name: recipe.name });
      if (!exists) {
        await Recipe.create(recipe);
        inserted++;
        console.log(`  ➕ ${recipe.category}: ${recipe.name}`);
      } else {
        console.log(`  ⏭️  Already exists: ${recipe.name}`);
      }
    }

    console.log(`\n✅ Seed complete: ${inserted} new recipes added (${seedRecipes.length - inserted} already existed)`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
}

seed();
