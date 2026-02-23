process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const mongoose = require('mongoose');
const Recipe = require('./models/Recipe');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo-service:27017/chefmatch';

const imageFixes = {
  "Traditional Guacamole":           "https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=800&q=80",
  "Saltimbocca alla Romana":         "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=800&q=80",
  "Tamales de Rajas":                "https://images.unsplash.com/photo-1613514785940-daed07799d9b?auto=format&fit=crop&w=800&q=80",
  "Mushroom Tacos":                  "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80",
  "Stuffed Bell Peppers":            "https://images.unsplash.com/photo-1625944525533-473f1a3d54e7?auto=format&fit=crop&w=800&q=80",
  "Avocado Toast Deluxe":            "https://images.unsplash.com/photo-1603046891744-1f057a96acc5?auto=format&fit=crop&w=800&q=80",
  "Okonomiyaki":                     "https://images.unsplash.com/photo-1529563021893-cc83c992d75d?auto=format&fit=crop&w=800&q=80",
  "Pulled Pork Sandwich":            "https://images.unsplash.com/photo-1582196016295-f8c8bd4b3a99?auto=format&fit=crop&w=800&q=80",
  "Mango Sorbet":                    "https://images.unsplash.com/photo-1567206563114-c179706b0b91?auto=format&fit=crop&w=800&q=80",
  "Banana Foster":                   "https://images.unsplash.com/photo-1481070414801-51fd732d7184?auto=format&fit=crop&w=800&q=80",
  "Profiteroles":                    "https://images.unsplash.com/photo-1558642891-54be180ea339?auto=format&fit=crop&w=800&q=80",
  "Crème Brûlée":                    "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=800&q=80",
  "Lobster Roll":                    "https://images.unsplash.com/photo-1571116040652-d3f5a13ea033?auto=format&fit=crop&w=800&q=80",
  "Mac and Cheese":                  "https://images.unsplash.com/photo-1612182189700-2b7a4d3cb7ec?auto=format&fit=crop&w=800&q=80",
  "Karaage":                         "https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?auto=format&fit=crop&w=800&q=80",
  "Quesadillas de Flor de Calabaza": "https://images.unsplash.com/photo-1600198770008-84ed7e4e4b46?auto=format&fit=crop&w=800&q=80",
  "Chiles Rellenos":                 "https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?auto=format&fit=crop&w=800&q=80",
  "Focaccia Genovese":               "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
};

async function fixImages() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    let fixed = 0, notFound = 0;
    for (const [name, imageUrl] of Object.entries(imageFixes)) {
      const result = await Recipe.updateMany({ name }, { $set: { imageUrl } });
      if (result.matchedCount > 0) {
        console.log(`  ✅ Fixed: ${name}`);
        fixed += result.matchedCount;
      } else {
        console.log(`  ⚠️  Not found: ${name}`);
        notFound++;
      }
    }
    console.log(`\n📊 Done: ${fixed} recipes updated, ${notFound} not found.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}
fixImages();
