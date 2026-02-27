process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { authenticateJWT } = require('./middleware/auth');
const client = require('prom-client');

const amqplib = require('amqplib');

const app = express();
app.use(cors());
app.use(express.json());

const Recipe   = require('./models/Recipe');
const Rating   = require('./models/Rating');
const MealPlan = require('./models/MealPlan');
require('dotenv').config();



// ── Prometheus ────────────────────────────────────────────────────
client.collectDefaultMetrics({ timeout: 5000 });
const httpRequestDuration = new client.Histogram({ name:'http_request_duration_seconds', help:'Duration', labelNames:['method','route','status_code'], buckets:[0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5] });
const httpRequestTotal    = new client.Counter({ name:'http_requests_total', help:'Total', labelNames:['method','route','status_code'] });
const httpRequestErrors   = new client.Counter({ name:'http_request_errors_total', help:'Errors', labelNames:['method','route','status_code','error_type'] });
app.use((req,res,next)=>{
  const start=Date.now(), oe=res.end;
  res.end=function(...a){ const d=(Date.now()-start)/1000, r=req.route?req.route.path:req.path; httpRequestDuration.labels(req.method,r,res.statusCode).observe(d); httpRequestTotal.labels(req.method,r,res.statusCode).inc(); if(res.statusCode>=400) httpRequestErrors.labels(req.method,r,res.statusCode,res.statusCode>=500?'server_error':'client_error').inc(); oe.apply(res,a); };
  next();
});

// ── Seed data ─────────────────────────────────────────────────────
const seedRecipes = [
  { name:'Carbonara Pasta', category:'Italian', cookingTime:25, description:'Classic Roman pasta with creamy egg sauce, guanciale, Pecorino Romano and black pepper.', ingredients:['400g spaghetti','200g guanciale','4 egg yolks','100g Pecorino Romano','Black pepper','Salt'], instructions:'1. Cook pasta in salted water until al dente.\n2. Fry guanciale until crispy, reserve fat.\n3. Mix egg yolks with grated Pecorino and black pepper.\n4. Drain pasta reserving 1 cup pasta water.\n5. Off heat, toss pasta with guanciale and fat.\n6. Add egg mixture tossing quickly, add pasta water to create creamy sauce.\n7. Serve immediately with extra Pecorino.', imageUrl:'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Margherita Pizza', category:'Italian', cookingTime:20, description:'Iconic Neapolitan pizza with San Marzano tomato sauce, fresh mozzarella and basil.', ingredients:['Pizza dough','200g San Marzano tomatoes','150g fresh mozzarella','Fresh basil','Olive oil','Salt'], instructions:'1. Preheat oven to 250C.\n2. Stretch dough.\n3. Spread tomatoes.\n4. Add mozzarella.\n5. Bake 8-10 min.', imageUrl:'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Risotto ai Funghi', category:'Italian', cookingTime:35, description:'Creamy mushroom risotto with parmesan.', ingredients:['Arborio rice','Porcini mushrooms','Parmesan','White wine','Vegetable broth'], instructions:'1. Saute mushrooms.\n2. Toast rice, deglaze with wine.\n3. Add broth ladle by ladle.\n4. Finish with parmesan.', imageUrl:'https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Lasagna Bolognese', category:'Italian', cookingTime:90, description:'Classic layered pasta with meat sauce.', ingredients:['Lasagna sheets','Ground beef','Bechamel','Tomato sauce','Parmesan'], instructions:'1. Make bolognese.\n2. Make bechamel.\n3. Layer and bake 45 min at 180C.', imageUrl:'https://images.unsplash.com/photo-1619895092538-128341789043?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Gnocchi al Pesto', category:'Italian', cookingTime:25, description:'Potato gnocchi with fresh basil pesto.', ingredients:['Potato gnocchi','Fresh basil','Pine nuts','Parmesan','Olive oil'], instructions:'1. Blend pesto.\n2. Cook gnocchi until they float.\n3. Toss with pesto.', imageUrl:'https://images.unsplash.com/photo-1551183053-bf91798d047d?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Ossobuco Milanese', category:'Italian', cookingTime:130, description:'Braised veal shanks Milanese style.', ingredients:['Veal shanks','White wine','Gremolata','Onion','Carrot'], instructions:'1. Brown shanks.\n2. Add wine and veg.\n3. Braise 2h.\n4. Serve with gremolata.', imageUrl:'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Penne Arrabbiata', category:'Italian', cookingTime:25, description:'Spicy tomato pasta.', ingredients:['Penne','San Marzano tomatoes','Red chili','Garlic','Olive oil'], instructions:'1. Saute garlic and chili.\n2. Add tomatoes.\n3. Simmer 15 min.\n4. Toss with pasta.', imageUrl:'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Saltimbocca alla Romana', category:'Italian', cookingTime:20, description:'Veal with prosciutto and sage.', ingredients:['Veal escalopes','Prosciutto','Fresh sage','White wine','Butter'], instructions:'1. Top veal with prosciutto and sage.\n2. Pan fry 2 min each side.\n3. Deglaze with wine.', imageUrl:'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Focaccia Genovese', category:'Italian', cookingTime:150, description:'Fluffy Ligurian flatbread.', ingredients:['Bread flour','Olive oil','Sea salt','Rosemary','Yeast'], instructions:'1. Make dough, rest 2h.\n2. Stretch, dimple, add oil and salt.\n3. Bake 25 min at 220C.', imageUrl:'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Bruschetta al Pomodoro', category:'Italian', cookingTime:10, description:'Toasted bread with fresh tomatoes.', ingredients:['Sourdough bread','Cherry tomatoes','Fresh basil','Garlic','Olive oil'], instructions:'1. Toast bread.\n2. Rub with garlic.\n3. Top with tomatoes and basil.\n4. Drizzle oil.', imageUrl:'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Tacos al Pastor', category:'Mexican', cookingTime:40, description:'Iconic Mexico City street tacos with achiote-marinated pork and pineapple.', ingredients:['500g pork shoulder','Dried guajillo chiles','Pineapple','Corn tortillas','Cilantro','Lime','Achiote paste'], instructions:'1. Soak chiles, blend with achiote.\n2. Marinate pork overnight.\n3. Grill pork.\n4. Assemble with pineapple, onion, cilantro.', imageUrl:'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Traditional Guacamole', category:'Mexican', cookingTime:10, description:'Authentic Mexican guacamole with ripe avocados, lime and jalapeño.', ingredients:['3 ripe avocados','1 lime','1 jalapeno','1/2 white onion','2 tomatoes','Cilantro','Salt'], instructions:'1. Mash avocados.\n2. Add jalapeño, onion, lime, salt.\n3. Fold in tomato and cilantro.', imageUrl:'https://images.unsplash.com/photo-1600335895229-6e75511892c8?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Enchiladas Verdes', category:'Mexican', cookingTime:45, description:'Tortillas filled with chicken in green salsa.', ingredients:['Corn tortillas','Chicken breast','Tomatillo salsa','Sour cream','Queso fresco'], instructions:'1. Cook and shred chicken.\n2. Fill and roll tortillas.\n3. Cover with green salsa.\n4. Bake 20 min.', imageUrl:'https://images.unsplash.com/photo-1534352956036-cd81e27dd615?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Pozole Rojo', category:'Mexican', cookingTime:120, description:'Hominy corn soup with pork.', ingredients:['Hominy corn','Pork shoulder','Guajillo chili','Oregano','Cabbage'], instructions:'1. Cook pork.\n2. Make chili broth.\n3. Combine with hominy.\n4. Serve with cabbage.', imageUrl:'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Chiles Rellenos', category:'Mexican', cookingTime:50, description:'Stuffed poblano peppers in tomato sauce.', ingredients:['Poblano peppers','Oaxaca cheese','Eggs','Tomato sauce','Flour'], instructions:'1. Roast peppers.\n2. Stuff with cheese.\n3. Coat in egg batter and fry.\n4. Serve in tomato sauce.', imageUrl:'https://images.unsplash.com/photo-1617611413012-715a1c4b4c0f?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Cochinita Pibil', category:'Mexican', cookingTime:250, description:'Slow-cooked achiote pork from Yucatan.', ingredients:['Pork shoulder','Achiote paste','Orange juice','Banana leaves','Pickled onion'], instructions:'1. Marinate overnight.\n2. Wrap in banana leaves.\n3. Slow cook 4h at 160C.\n4. Shred and serve.', imageUrl:'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Sopa de Lima', category:'Mexican', cookingTime:40, description:'Yucatan lime soup with chicken.', ingredients:['Chicken broth','Chicken breast','Lime juice','Corn tortillas','Avocado'], instructions:'1. Cook chicken in broth.\n2. Shred and return.\n3. Add lime.\n4. Serve with tortilla strips.', imageUrl:'https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Tamales de Rajas', category:'Mexican', cookingTime:90, description:'Corn dough tamales with poblano strips.', ingredients:['Masa harina','Lard','Poblano strips','Corn husks','Oaxaca cheese'], instructions:'1. Soak husks.\n2. Make masa.\n3. Fill and fold.\n4. Steam 1h.', imageUrl:'https://images.unsplash.com/photo-1625944525533-473f1a3d54e7?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Quesadillas de Flor de Calabaza', category:'Mexican', cookingTime:15, description:'Squash blossom quesadillas.', ingredients:['Corn tortillas','Squash blossoms','Oaxaca cheese','Epazote','Salsa verde'], instructions:'1. Fill tortillas.\n2. Cook until cheese melts.\n3. Serve with salsa.', imageUrl:'https://images.unsplash.com/photo-1618040996337-56904b7850b9?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Mole Negro', category:'Mexican', cookingTime:180, description:'Complex dark mole with turkey.', ingredients:['Turkey leg','Mulato chilies','Chocolate','Plantain','Sesame seeds'], instructions:'1. Toast and soak chilies.\n2. Blend with chocolate.\n3. Fry paste.\n4. Cook turkey in mole 1h.', imageUrl:'https://images.unsplash.com/photo-1553163147-622ab57be1c7?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Chickpea Curry', category:'Vegan', cookingTime:35, description:'Hearty Indian-style chickpea curry with coconut milk.', ingredients:['2 cans chickpeas','1 can coconut milk','1 can diced tomatoes','1 onion','Garam masala','Cumin','Turmeric','Cilantro'], instructions:'1. Saute onion.\n2. Add spices.\n3. Add tomatoes and chickpeas.\n4. Add coconut milk, simmer 15 min.', imageUrl:'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Buddha Bowl', category:'Vegan', cookingTime:40, description:'Nourishing bowl with roasted veggies, quinoa and tahini.', ingredients:['Quinoa','Chickpeas','Sweet potatoes','Avocado','Edamame','Kale','Tahini'], instructions:'1. Cook quinoa.\n2. Roast sweet potato and chickpeas.\n3. Make tahini dressing.\n4. Assemble.', imageUrl:'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Lentil Dal', category:'Vegan', cookingTime:30, description:'Indian spiced red lentil soup.', ingredients:['Red lentils','Coconut milk','Turmeric','Cumin','Ginger'], instructions:'1. Saute spices.\n2. Add lentils and broth.\n3. Cook 20 min.\n4. Stir in coconut milk.', imageUrl:'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Mushroom Tacos', category:'Vegan', cookingTime:25, description:'Crispy portobello mushroom tacos.', ingredients:['Portobello mushrooms','Corn tortillas','Avocado','Lime','Chipotle'], instructions:'1. Marinate mushrooms.\n2. Grill until charred.\n3. Assemble with avocado and lime.', imageUrl:'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Falafel Wrap', category:'Vegan', cookingTime:35, description:'Crispy chickpea balls in flatbread.', ingredients:['Chickpeas','Flatbread','Hummus','Cucumber','Parsley'], instructions:'1. Blend chickpeas with herbs.\n2. Form and fry balls.\n3. Spread hummus.\n4. Add falafel and veg.', imageUrl:'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Vegetable Paella', category:'Vegan', cookingTime:50, description:'Spanish rice with seasonal vegetables.', ingredients:['Bomba rice','Bell peppers','Artichokes','Saffron','Vegetable broth'], instructions:'1. Saute veg.\n2. Add rice and saffron.\n3. Pour broth, do not stir.\n4. Cook until socarrat forms.', imageUrl:'https://images.unsplash.com/photo-1534080564583-6be75777b70a?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Stuffed Bell Peppers', category:'Vegan', cookingTime:50, description:'Peppers filled with quinoa and vegetables.', ingredients:['Bell peppers','Quinoa','Black beans','Corn','Tomato sauce'], instructions:'1. Cook quinoa.\n2. Mix with beans and corn.\n3. Fill peppers.\n4. Bake 30 min.', imageUrl:'https://images.unsplash.com/photo-1563699740773-cb7de04ba4dd?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Tofu Stir Fry', category:'Vegan', cookingTime:25, description:'Crispy tofu with vegetables in soy sauce.', ingredients:['Firm tofu','Broccoli','Snap peas','Soy sauce','Sesame oil'], instructions:'1. Press and cube tofu.\n2. Fry until golden.\n3. Stir fry veg.\n4. Combine with sauce.', imageUrl:'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Cauliflower Curry', category:'Vegan', cookingTime:40, description:'Roasted cauliflower in tomato curry.', ingredients:['Cauliflower','Canned tomatoes','Garam masala','Garlic','Ginger'], instructions:'1. Roast cauliflower.\n2. Make curry sauce.\n3. Add cauliflower.\n4. Simmer 15 min.', imageUrl:'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Avocado Toast Deluxe', category:'Vegan', cookingTime:10, description:'Sourdough with smashed avocado and toppings.', ingredients:['Sourdough bread','Avocado','Cherry tomatoes','Microgreens','Lemon'], instructions:'1. Toast bread.\n2. Smash avocado with lemon.\n3. Spread on toast.\n4. Top with tomatoes.', imageUrl:'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Sushi Maki Roll', category:'Japanese', cookingTime:45, description:'Homemade maki rolls with sushi rice, nori, salmon and cucumber.', ingredients:['2 cups sushi rice','Nori sheets','200g fresh salmon','1 cucumber','Soy sauce','Wasabi'], instructions:'1. Cook and season rice.\n2. Lay nori, spread rice.\n3. Add filling and roll.\n4. Slice and serve.', imageUrl:'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Chicken Ramen', category:'Japanese', cookingTime:90, description:'Comforting ramen with rich chicken broth and toppings.', ingredients:['Ramen noodles','1 whole chicken','Soy sauce','Mirin','4 eggs','Nori','Spring onions'], instructions:'1. Simmer chicken 2h for broth.\n2. Season broth.\n3. Marinate soft-boiled eggs.\n4. Assemble bowls.', imageUrl:'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Tonkatsu', category:'Japanese', cookingTime:25, description:'Breaded pork cutlet with tonkatsu sauce.', ingredients:['Pork loin','Panko breadcrumbs','Egg','Cabbage','Tonkatsu sauce'], instructions:'1. Pound pork.\n2. Coat in flour, egg, panko.\n3. Deep fry until golden.\n4. Serve with cabbage.', imageUrl:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Gyoza', category:'Japanese', cookingTime:40, description:'Pan-fried pork and cabbage dumplings.', ingredients:['Gyoza wrappers','Ground pork','Cabbage','Ginger','Soy sauce'], instructions:'1. Mix filling.\n2. Fill and fold wrappers.\n3. Pan fry until golden.\n4. Add water and steam.', imageUrl:'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Miso Ramen', category:'Japanese', cookingTime:90, description:'Rich miso broth ramen with toppings.', ingredients:['Ramen noodles','Miso paste','Pork belly','Soft boiled egg','Corn'], instructions:'1. Make pork broth.\n2. Whisk in miso.\n3. Cook noodles.\n4. Assemble.', imageUrl:'https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Yakitori', category:'Japanese', cookingTime:25, description:'Grilled chicken skewers with tare sauce.', ingredients:['Chicken thighs','Tare sauce','Spring onion','Bamboo skewers','Sake'], instructions:'1. Skewer chicken with onion.\n2. Grill brushing with tare.\n3. Finish with extra sauce.', imageUrl:'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Tempura Udon', category:'Japanese', cookingTime:35, description:'Thick noodle soup with crispy tempura.', ingredients:['Udon noodles','Dashi broth','Shrimp','Tempura batter','Soy sauce'], instructions:'1. Make dashi broth.\n2. Make cold tempura batter.\n3. Fry shrimp.\n4. Serve udon topped with tempura.', imageUrl:'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Karaage', category:'Japanese', cookingTime:30, description:'Japanese fried chicken, crispy and juicy.', ingredients:['Chicken thighs','Soy sauce','Mirin','Ginger','Potato starch'], instructions:'1. Marinate chicken.\n2. Coat in starch.\n3. Double fry.\n4. Serve with mayo.', imageUrl:'https://images.unsplash.com/photo-1562802378-063ec186a863?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Okonomiyaki', category:'Japanese', cookingTime:20, description:'Savory Japanese pancake with cabbage.', ingredients:['Cabbage','Flour','Eggs','Pork belly','Okonomiyaki sauce'], instructions:'1. Mix batter with cabbage.\n2. Add pork.\n3. Cook on griddle.\n4. Top with sauce and mayo.', imageUrl:'https://images.unsplash.com/photo-1617196034183-421b4040ed20?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Beef Teriyaki Bowl', category:'Japanese', cookingTime:20, description:'Glazed beef slices over steamed rice.', ingredients:['Beef sirloin','Teriyaki sauce','Steamed rice','Sesame seeds','Spring onion'], instructions:'1. Slice beef.\n2. Sear in pan.\n3. Add teriyaki and glaze.\n4. Serve over rice.', imageUrl:'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Classic Burger', category:'American', cookingTime:30, description:'Juicy smash burger with double patties and caramelized onions.', ingredients:['500g 80/20 ground beef','4 burger buns','4 slices American cheese','1 onion','Pickles','Lettuce','Tomato','Mayonnaise'], instructions:'1. Make special sauce.\n2. Caramelize onion.\n3. Smash and cook patties.\n4. Assemble.', imageUrl:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'BBQ Ribs', category:'American', cookingTime:210, description:'Fall-off-the-bone pork ribs with smoky BBQ glaze.', ingredients:['2 racks baby back ribs','Brown sugar','Smoked paprika','Garlic powder','BBQ sauce'], instructions:'1. Apply dry rub.\n2. Bake wrapped at 150C 2.5h.\n3. Unwrap, glaze and grill.', imageUrl:'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Mac and Cheese', category:'American', cookingTime:40, description:'Creamy baked macaroni and cheese.', ingredients:['Macaroni','Cheddar cheese','Milk','Butter','Breadcrumbs'], instructions:'1. Make cheese sauce.\n2. Mix with pasta.\n3. Top with breadcrumbs.\n4. Bake 20 min.', imageUrl:'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Buffalo Wings', category:'American', cookingTime:50, description:'Crispy chicken wings in hot sauce.', ingredients:['Chicken wings','Hot sauce','Butter','Blue cheese dip','Celery'], instructions:'1. Bake wings at 220C until crispy.\n2. Toss in hot sauce and butter.\n3. Serve with dip.', imageUrl:'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Philly Cheesesteak', category:'American', cookingTime:25, description:'Steak sandwich with melted cheese.', ingredients:['Ribeye steak','Hoagie roll','Provolone cheese','Onion','Green pepper'], instructions:'1. Slice steak thin.\n2. Cook with veg.\n3. Melt cheese on top.\n4. Load into roll.', imageUrl:'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Clam Chowder', category:'American', cookingTime:40, description:'New England creamy clam soup.', ingredients:['Clams','Potatoes','Bacon','Heavy cream','Onion'], instructions:'1. Cook bacon.\n2. Saute onion.\n3. Add potatoes and clam juice.\n4. Stir in cream.', imageUrl:'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Pulled Pork Sandwich', category:'American', cookingTime:480, description:'Slow-cooked pulled pork on brioche.', ingredients:['Pork shoulder','BBQ sauce','Brioche bun','Coleslaw','Pickles'], instructions:'1. Slow cook 8h at 120C.\n2. Shred with BBQ sauce.\n3. Serve on bun with coleslaw.', imageUrl:'https://images.unsplash.com/photo-1558030089-8a11c5d46e0a?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Corn Dog', category:'American', cookingTime:20, description:'Hot dogs coated in cornbread batter.', ingredients:['Hot dogs','Cornmeal','Flour','Egg','Mustard'], instructions:'1. Make batter.\n2. Skewer and dip dogs.\n3. Deep fry.\n4. Serve with mustard.', imageUrl:'https://images.unsplash.com/photo-1619881590738-a111d176d906?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Lobster Roll', category:'American', cookingTime:30, description:'New England lobster in a buttered roll.', ingredients:['Lobster meat','Hot dog bun','Mayonnaise','Celery','Lemon'], instructions:'1. Cook and chop lobster.\n2. Mix with mayo and celery.\n3. Toast bun.\n4. Fill and serve.', imageUrl:'https://images.unsplash.com/photo-1569054474823-4afe79fbaee4?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Chicken and Waffles', category:'American', cookingTime:45, description:'Crispy fried chicken on fluffy waffles.', ingredients:['Chicken thighs','Waffle batter','Maple syrup','Hot sauce','Butter'], instructions:'1. Marinate and fry chicken.\n2. Make waffles.\n3. Serve with maple syrup.', imageUrl:'https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Tiramisu', category:'Desserts', cookingTime:30, description:'Classic Italian dessert with espresso-soaked ladyfingers and mascarpone cream.', ingredients:['500g mascarpone','4 eggs','100g sugar','200ml espresso','2 tbsp Marsala','200g ladyfingers','Cocoa powder'], instructions:'1. Beat yolks with sugar.\n2. Fold in mascarpone.\n3. Fold in egg whites.\n4. Dip ladyfingers, layer, refrigerate 4h.', imageUrl:'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Strawberry Cheesecake', category:'Desserts', cookingTime:90, description:'Creamy baked cheesecake with fresh strawberry sauce.', ingredients:['700g cream cheese','200g digestive biscuits','200g sugar','3 eggs','200ml sour cream','500g strawberries'], instructions:'1. Make biscuit base.\n2. Beat cream cheese, add eggs.\n3. Bake in water bath.\n4. Top with strawberry sauce.', imageUrl:'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Creme Brulee', category:'Desserts', cookingTime:60, description:'Classic French custard with caramel top.', ingredients:['Heavy cream','Egg yolks','Sugar','Vanilla bean','Brown sugar'], instructions:'1. Heat cream with vanilla.\n2. Mix with yolks and sugar.\n3. Bake in water bath 45 min.\n4. Chill then torch sugar top.', imageUrl:'https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Chocolate Lava Cake', category:'Desserts', cookingTime:20, description:'Warm chocolate cake with molten center.', ingredients:['Dark chocolate','Butter','Eggs','Sugar','Flour'], instructions:'1. Melt chocolate and butter.\n2. Whisk eggs and sugar.\n3. Fold in flour.\n4. Bake 12 min.', imageUrl:'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Panna Cotta', category:'Desserts', cookingTime:20, description:'Italian cream dessert with berry coulis.', ingredients:['Heavy cream','Gelatin','Sugar','Vanilla','Mixed berries'], instructions:'1. Heat cream with sugar.\n2. Dissolve gelatin.\n3. Pour into molds, chill 4h.\n4. Serve with berry coulis.', imageUrl:'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Apple Pie', category:'Desserts', cookingTime:90, description:'Classic American apple pie.', ingredients:['Pie crust','Granny Smith apples','Cinnamon','Brown sugar','Butter'], instructions:'1. Slice apples with sugar and cinnamon.\n2. Fill crust with lattice top.\n3. Bake 50 min at 190C.', imageUrl:'https://images.unsplash.com/photo-1568571780765-9276ac8b75a2?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Profiteroles', category:'Desserts', cookingTime:50, description:'Choux pastry with cream and chocolate.', ingredients:['Choux pastry','Whipped cream','Dark chocolate','Butter','Icing sugar'], instructions:'1. Pipe and bake choux balls.\n2. Fill with cream.\n3. Drizzle chocolate.', imageUrl:'https://images.unsplash.com/photo-1530610476181-d83430b64dcd?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Churros con Chocolate', category:'Desserts', cookingTime:30, description:'Fried dough sticks with hot chocolate dip.', ingredients:['Flour','Water','Salt','Dark chocolate','Cinnamon sugar'], instructions:'1. Make choux dough.\n2. Pipe and fry.\n3. Roll in cinnamon sugar.\n4. Serve with hot chocolate.', imageUrl:'https://images.unsplash.com/photo-1624371414361-e670edf4850e?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Mango Sorbet', category:'Desserts', cookingTime:20, description:'Refreshing mango sorbet, dairy free.', ingredients:['Ripe mangoes','Sugar syrup','Lime juice','Mint'], instructions:'1. Blend mango with syrup and lime.\n2. Churn or freeze stirring every 30 min.\n3. Serve with mint.', imageUrl:'https://images.unsplash.com/photo-1488900128323-21503983a07e?auto=format&fit=crop&w=800&q=80', userId:'seed' },
  { name:'Banana Foster', category:'Desserts', cookingTime:15, description:'Caramelized bananas with rum and ice cream.', ingredients:['Bananas','Brown sugar','Rum','Butter','Vanilla ice cream'], instructions:'1. Melt butter and sugar.\n2. Add bananas.\n3. Add rum and flambe.\n4. Serve over ice cream.', imageUrl:'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=800&q=80', userId:'seed' }
];

async function autoSeed() {
  try {
    const count = await Recipe.countDocuments();
    if (count > 0) { console.log(`DB already has ${count} recipes — skipping seed`); return; }
    console.log('Empty DB — running auto-seed...');
    let inserted = 0;
    for (const r of seedRecipes) {
      const exists = await Recipe.findOne({ name: r.name });
      if (!exists) { await Recipe.create(r); inserted++; }
    }
    console.log(`Auto-seed complete: ${inserted} recipes inserted`);
  } catch (err) {
    console.error('Auto-seed error:', err.message);
  }
}

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chefmatch')
  .then(async () => { console.log('Connected to MongoDB'); await autoSeed(); })
  .catch(err => console.error('DB Error:', err));

async function listenForUserEvents() {
  try {
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672');
    const channel = await conn.createChannel();
    await channel.assertQueue('user_events');
    console.log('Listening for user events on RabbitMQ...');
    channel.consume('user_events', async (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        if (event.action === 'USER_DELETED') {
          console.log(`Deleting data for user: ${event.userId}`);
          await Promise.all([
            Recipe.deleteMany({ userId: event.userId }),
            MealPlan.deleteMany({ userId: event.userId }),
            Rating.deleteMany({ userId: event.userId })   // cascada de ratings
          ]);
        }
        channel.ack(msg);
      }
    });
  } catch (err) {
    console.error('RabbitMQ error:', err.message);
    setTimeout(listenForUserEvents, 5000);
  }
}
listenForUserEvents();

async function generateMealPlanFromDB(userId, monthNum, yearNum, category) {
  let allRecipes = (category && category !== 'Mixed') ? await Recipe.find({ category }).lean() : await Recipe.find().lean();
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const shuffle = (arr) => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
  const getPool = (n) => { if(!allRecipes.length) return Array(n).fill({name:'No recipes available',category}); let p=[]; while(p.length<n) p=[...p,...shuffle(allRecipes)]; return p.slice(0,n); };
  const lp=getPool(daysInMonth), dp=getPool(daysInMonth);
  const days=[];
  for(let d=1;d<=daysInMonth;d++){
    let l=lp[d-1], di=dp[d-1];
    if(l.name===di.name && allRecipes.length>1){ const alt=allRecipes.find(r=>r.name!==l.name); if(alt) di=alt; }
    days.push({ dayNumber:d, lunch:{recipeId:l._id||String(d),recipeName:l.name,category:l.category||category}, dinner:{recipeId:di._id||String(d+100),recipeName:di.name,category:di.category||category} });
  }
  return new MealPlan({ userId, month:monthNum, year:yearNum, category:category||'Mixed', days });
}

// ── RECIPE ENDPOINTS ──────────────────────────────────────────────
app.get('/recipes', async (req, res) => {
  try {
    const { sort } = req.query;
    let q = Recipe.find();
    if (sort === 'rating_desc') q = q.sort({ averageRating: -1 });
    else if (sort === 'rating_asc') q = q.sort({ averageRating: 1 });
    res.json(await q.exec());
  } catch (err) { res.status(500).json({ error: 'Error fetching recipes' }); }
});



app.post('/recipes', authenticateJWT, async (req, res) => {
  try {
    const recipe = new Recipe({ ...req.body, userId: req.user.sub });
    await recipe.save();
    res.status(201).json(recipe);
  } catch (err) { res.status(400).json({ error: 'Error saving recipe', details: err.message }); }
});

// ✅ DELETE — solo el autor puede borrar + cascada en Rating
app.delete('/recipes/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(403).json({ error: 'Cannot delete static recipes' });
    const recipe = await Recipe.findById(id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    if (recipe.userId !== req.user.sub) return res.status(403).json({ error: 'You can only delete recipes you have created' });
    await Promise.all([Recipe.findByIdAndDelete(id), Rating.deleteMany({ recipeId: id })]);
    res.json({ message: 'Recipe deleted successfully' });
  } catch (err) { res.status(500).json({ error: 'Error deleting recipe' }); }
});

// ✅ RATE — colección Rating separada, una valoración por usuario por receta
app.post('/recipes/:id/rate', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid recipe id' });
    const parsedScore = Number(req.body.score);
    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10) return res.status(400).json({ error: 'Score must be 0-10' });
    const recipe = await Recipe.findById(id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    const existing = await Rating.findOne({ userId: req.user.sub, recipeId: id });
    if (existing) return res.status(409).json({ error: 'You have already rated this recipe' });
    await Rating.create({ userId: req.user.sub, recipeId: id, score: parsedScore });
    const ratings = await Rating.find({ recipeId: id });
    const total = ratings.reduce((s, r) => s + r.score, 0);
    recipe.ratingCount = ratings.length;
    recipe.averageRating = Math.round((total / ratings.length) * 10) / 10;
    await recipe.save();
    res.json({ message: 'Rating saved', averageRating: recipe.averageRating, ratingCount: recipe.ratingCount });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'You have already rated this recipe' });
    res.status(500).json({ error: 'Error saving rating' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'recipe-service' }));

// ── MEAL PLAN ENDPOINTS ───────────────────────────────────────────
app.get('/meal-plans/:userId/:month/:year', authenticateJWT, async (req, res) => {
  try {
    const { userId, month, year } = req.params;
    const { category } = req.query;
    if (req.user.sub !== userId) return res.status(403).json({ error: 'Access denied' });
    const monthNum = parseInt(month), yearNum = parseInt(year);
    if (monthNum<1||monthNum>12||yearNum<2024||yearNum>2030) return res.status(400).json({ error: 'Invalid month or year' });
    let mealPlan = await MealPlan.findOne({ userId, month: monthNum, year: yearNum });
    if (mealPlan && category && mealPlan.category !== category) { await MealPlan.deleteOne({ _id: mealPlan._id }); mealPlan = null; }
    if (!mealPlan) { mealPlan = await generateMealPlanFromDB(userId, monthNum, yearNum, category||'Mixed'); await mealPlan.save(); }
    res.json(mealPlan);
  } catch (err) { res.status(500).json({ error: 'Internal server error', details: err.message }); }
});

app.post('/meal-plans', authenticateJWT, async (req, res) => {
  try {
    const { userId, month, year, category, days } = req.body;
    if (req.user.sub !== userId) return res.status(403).json({ error: 'Access denied' });
    if (!userId||!month||!year) return res.status(400).json({ error: 'Missing required fields' });
    let mealPlan = await MealPlan.findOne({ userId, month, year });
    if (mealPlan) { if(category) mealPlan.category=category; if(days) mealPlan.days=days; mealPlan.updatedAt=new Date(); await mealPlan.save(); }
    else { mealPlan = days ? new MealPlan({userId,month,year,category:category||'Mixed',days}) : await generateMealPlanFromDB(userId,month,year,category||'Mixed'); await mealPlan.save(); }
    res.status(201).json(mealPlan);
  } catch (err) { if(err.code===11000) return res.status(409).json({error:'Already exists'}); res.status(500).json({error:'Internal server error',details:err.message}); }
});

app.put('/meal-plans/:id/day/:dayNumber', authenticateJWT, async (req, res) => {
  try {
    const { id, dayNumber } = req.params;
    const { lunch, dinner, notes } = req.body;
    const mp = await MealPlan.findById(id);
    if (!mp) return res.status(404).json({ error: 'Not found' });
    if (mp.userId !== req.user.sub) return res.status(403).json({ error: 'Access denied' });
    const idx = mp.days.findIndex(d => d.dayNumber === parseInt(dayNumber));
    if (idx === -1) mp.days.push({ dayNumber: parseInt(dayNumber), lunch, dinner, notes });
    else { if(lunch) mp.days[idx].lunch=lunch; if(dinner) mp.days[idx].dinner=dinner; if(notes!==undefined) mp.days[idx].notes=notes; }
    mp.updatedAt = new Date(); await mp.save(); res.json(mp);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/meal-plans/:id', authenticateJWT, async (req, res) => {
  try {
    const mp = await MealPlan.findById(req.params.id);
    if (!mp) return res.status(404).json({ error: 'Not found' });
    if (mp.userId !== req.user.sub) return res.status(403).json({ error: 'Access denied' });
    await MealPlan.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/meal-plans/:id/day/:dayNumber', authenticateJWT, async (req, res) => {
  try {
    const mp = await MealPlan.findById(req.params.id);
    if (!mp) return res.status(404).json({ error: 'Not found' });
    if (mp.userId !== req.user.sub) return res.status(403).json({ error: 'Access denied' });
    mp.days = mp.days.filter(d => d.dayNumber !== parseInt(req.params.dayNumber));
    mp.updatedAt = new Date(); await mp.save(); res.json(mp);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/meal-plans/user/:userId', authenticateJWT, async (req, res) => {
  try {
    if (req.user.sub !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    res.json(await MealPlan.find({ userId: req.params.userId }).sort({ year:-1, month:-1 }));
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// ── Prometheus ────────────────────────────────────────────────────
app.get('/metrics', authenticateJWT, async (req, res) => { res.set('Content-Type', client.register.contentType); res.end(await client.register.metrics()); });

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
module.exports = app;
