const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
const Recipe = require('./models/Recipe');
require('dotenv').config();

// 1. Tus recetas estáticas (Actualizado con AMERICANA y POSTRES)
const staticRecipes = [
  // ITALIANA
  { 
    id: 1, 
    name: 'Pasta Carbonara', 
    category: 'Italiana', 
    description: 'La auténtica receta romana sin nata.',
    ingredients: ['400g Espaguetis', '150g Guanciale o Panceta', '4 Yemas de huevo', '100g Queso Pecorino', 'Pimienta negra'],
    instructions: '1. Hervir la pasta. \n2. Sofreír el guanciale hasta que esté crujiente. \n3. Batir las yemas con el queso y mucha pimienta. \n4. Mezclar la pasta caliente con el huevo fuera del fuego para crear la crema.'
  },
  { 
    id: 2, 
    name: 'Pizza Margarita', 
    category: 'Italiana', 
    description: 'La pizza napolitana clásica.',
    ingredients: ['Masa de pizza', 'Salsa de tomate San Marzano', 'Mozzarella fresca', 'Albahaca fresca', 'Aceite de oliva'],
    instructions: '1. Extender la masa. \n2. Añadir el tomate y la mozzarella. \n3. Hornear a máxima temperatura (250°C) durante 10-15 min. \n4. Añadir albahaca fresca al salir.'
  },
  
  // MEXICANA
  { 
    id: 3, 
    name: 'Tacos al Pastor', 
    category: 'Mexicana', 
    description: 'Tacos de cerdo marinado con piña.',
    ingredients: ['Tortillas de maíz', '500g Lomo de cerdo', 'Piña', 'Cilantro y Cebolla', 'Pasta de Achiote'],
    instructions: '1. Marinar la carne con achiote y especias. \n2. Asar la carne con la piña. \n3. Calentar tortillas. \n4. Servir con cilantro, cebolla y salsa.'
  },
  { 
    id: 4, 
    name: 'Guacamole Tradicional', 
    category: 'Mexicana', 
    description: 'El acompañamiento perfecto.',
    ingredients: ['3 Aguacates maduros', '1 Tomate', '1/2 Cebolla', 'Cilantro', 'Jugo de lima', 'Sal'],
    instructions: '1. Machacar los aguacates. \n2. Picar finamente cebolla, tomate y cilantro. \n3. Mezclar todo con jugo de lima y sal al gusto.'
  },

  // VEGANA
  { 
    id: 5, 
    name: 'Curry de Garbanzos', 
    category: 'Vegana', 
    description: 'Plato rico en proteínas y especias.',
    ingredients: ['400g Garbanzos cocidos', 'Leche de coco', 'Espinacas', 'Curry en polvo', 'Ajo y Jengibre'],
    instructions: '1. Sofreír ajo y jengibre. \n2. Añadir especias y garbanzos. \n3. Verter leche de coco y cocinar 10 min. \n4. Añadir espinacas al final.'
  },
  { 
    id: 6, 
    name: 'Buddha Bowl', 
    category: 'Vegana', 
    description: 'Bol nutritivo y colorido.',
    ingredients: ['Quinoa', 'Tofu marinado', 'Aguacate', 'Zanahoria rallada', 'Salsa de Tahini'],
    instructions: '1. Cocinar la quinoa. \n2. Saltear el tofu. \n3. Cortar los vegetales. \n4. Montar el bol y aderezar con tahini.'
  },

  // JAPONESA
  { 
    id: 7, 
    name: 'Sushi Maki Roll', 
    category: 'Japonesa', 
    description: 'Rollos de sushi caseros.',
    ingredients: ['Arroz para sushi', 'Algas Nori', 'Salmón o Pepino', 'Vinagre de arroz', 'Salsa de soja'],
    instructions: '1. Cocinar y aderezar el arroz. \n2. Colocar arroz sobre el alga. \n3. Poner el relleno y enrollar con esterilla. \n4. Cortar en 6-8 piezas.'
  },
  { 
    id: 8, 
    name: 'Ramen de Pollo', 
    category: 'Japonesa', 
    description: 'Sopa reconfortante con fideos.',
    ingredients: ['Caldo de pollo', 'Fideos Ramen', 'Pechuga de pollo', 'Huevo cocido', 'Cebollino'],
    instructions: '1. Calentar el caldo con soja y miso. \n2. Cocer los fideos aparte. \n3. Montar el bol con caldo, fideos y toppings (pollo, huevo, cebollino).'
  },

  // NUEVA: AMERICANA
  { 
    id: 9, 
    name: 'Hamburguesa Clásica', 
    category: 'Americana', 
    description: 'Jugosa hamburguesa con queso cheddar.',
    ingredients: ['Carne de res molida', 'Pan de brioche', 'Queso Cheddar', 'Lechuga y Tomate', 'Pepinillos'],
    instructions: '1. Formar las carnes sin apretar mucho. \n2. Cocinar a la plancha 3 min por lado. \n3. Derretir el queso encima. \n4. Tostar el pan y montar con las verduras.'
  },
  { 
    id: 10, 
    name: 'Costillas BBQ', 
    category: 'Americana', 
    description: 'Costillas de cerdo en salsa barbacoa.',
    ingredients: ['Costillar de cerdo', 'Salsa BBQ casera', 'Pimentón ahumado', 'Miel', 'Ajo en polvo'],
    instructions: '1. Adobar las costillas con especias en seco. \n2. Hornear a baja temperatura (150°C) por 2 horas envueltas en aluminio. \n3. Destapar, pincelar con salsa BBQ y gratinar 15 min.'
  },

  // NUEVA: POSTRES
  { 
    id: 11, 
    name: 'Tiramisú', 
    category: 'Postres', 
    description: 'Postre italiano de café y mascarpone.',
    ingredients: ['Bizcochos de soletilla', 'Queso Mascarpone', 'Café espresso fuerte', 'Cacao en polvo', 'Azúcar'],
    instructions: '1. Batir mascarpone con azúcar. \n2. Mojar bizcochos en café. \n3. Montar capas alternas de bizcocho y crema. \n4. Espolvorear cacao al final.'
  },
  { 
    id: 12, 
    name: 'Cheesecake de Fresa', 
    category: 'Postres', 
    description: 'Tarta de queso suave con frutas.',
    ingredients: ['Galletas maría', 'Mantequilla', 'Queso crema', 'Nata para montar', 'Mermelada de fresa'],
    instructions: '1. Triturar galletas con mantequilla para la base. \n2. Batir queso y nata y verter sobre la base. \n3. Refrigerar 4 horas mínimo. \n4. Cubrir con mermelada antes de servir.'
  }
];

// 2. Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chefmatch')
  .then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error DB:', err));

// 3. GET combinado (Estático + Base de Datos)
app.get('/recipes', async (req, res) => {
  try {
    const dynamicRecipes = await Recipe.find();
    res.json([...staticRecipes, ...dynamicRecipes]);
  } catch (err) {
    res.json(staticRecipes);
  }
});

// 4. POST para nuevas recetas
app.post('/recipes', async (req, res) => {
  try {
    const newRecipe = new Recipe(req.body);
    await newRecipe.save();
    res.status(201).json(newRecipe);
  } catch (err) {
    res.status(400).json({ error: "Error al guardar la receta" });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));