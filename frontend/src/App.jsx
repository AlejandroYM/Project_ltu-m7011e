import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Keycloak from 'keycloak-js';
import toast, { Toaster } from 'react-hot-toast'; 
import './App.css';
import MonthlyMealPlan from './components/MonthlyMealPlan';

const keycloak = new Keycloak({
  url: "https://keycloak.ltu-m7011e-5.se", 
  realm: "ChefMatchRealm",
  clientId: "frontend-client",
});

// ── Componente de estrellas / puntuación ────────────────────────────────────
function RatingDisplay({ average, count }) {
  const filled = Math.round(average);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '2px' }}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} style={{
            fontSize: '0.75rem',
            color: i < filled ? '#f97316' : 'rgba(255,255,255,0.2)',
            lineHeight: 1
          }}>●</span>
        ))}
      </div>
      <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: '0.9rem' }}>
        {average > 0 ? average.toFixed(1) : '—'}
      </span>
      <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({count})</span>
    </div>
  );
}

// ── Selector interactivo de puntuación ──────────────────────────────────────
function RatingSelector({ onRate, disabled }) {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);

  const handleRate = (score) => {
    if (disabled) return;
    setSelected(score);
    onRate(score);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      {Array.from({ length: 11 }, (_, i) => (
        <button
          key={i}
          onClick={() => handleRate(i)}
          onMouseEnter={() => !disabled && setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          disabled={disabled}
          style={{
            width: '32px', height: '32px',
            borderRadius: '6px',
            border: (selected === i) ? '2px solid #f97316' : '1px solid rgba(255,255,255,0.15)',
            background: (hovered !== null ? i <= hovered : selected !== null && i <= selected)
              ? 'rgba(249,115,22,0.3)'
              : 'rgba(255,255,255,0.05)',
            color: '#fff',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '0.8rem',
            transition: 'all 0.15s',
            opacity: disabled ? 0.5 : 1
          }}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState(false); 
  const [recipes, setRecipes] = useState([]);
  const [filteredRecipes, setFilteredRecipes] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterTime, setFilterTime] = useState("All");
  const [filterRating, setFilterRating] = useState("All"); // ✅ NUEVO

  const [showModal, setShowModal] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);

  // ── Estados para valoración ──────────────────────────────────────────────
  const [ratingLoading, setRatingLoading] = useState(false);
  const [userRatings, setUserRatings]     = useState({});   // { recipeId: score }

  // === ESTADOS PARA IMÁGENES ===
  const [imageOption, setImageOption] = useState('none');
  const [unsplashSearch, setUnsplashSearch] = useState('');
  const [unsplashResults, setUnsplashResults] = useState([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [imageFile, setImageFile] = useState(null);

  const cuisineStyles = [
    { name: 'Italian',  icon: '🍝', color: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
    { name: 'Mexican',  icon: '🌮', color: 'linear-gradient(135deg, #f09819 0%, #edde5d 100%)' },
    { name: 'Vegan',    icon: '🥗', color: 'linear-gradient(135deg, #a8ff78 0%, #78ffd6 100%)' },
    { name: 'Japanese', icon: '🍣', color: 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)' },
    { name: 'American', icon: '🍔', color: 'linear-gradient(135deg, #3a7bd5 0%, #3a6073 100%)' },
    { name: 'Desserts', icon: '🧁', color: 'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)' },
  ];

  const categoryImages = {
    italian:  "https://images.unsplash.com/photo-1498579150354-977475b7ea0b?auto=format&fit=crop&w=800&q=80",
    mexican:  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
    vegan:    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
    japanese: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80",
    american: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80",
    desserts: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80",
    default:  "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=800&q=80"
  };

  const getRecipeImage = (recipe) => {
    if (!recipe || !recipe.name) return categoryImages.default;
    if (recipe.imageUrl) return recipe.imageUrl;

    const nameKey = recipe.name.toLowerCase().trim();
    const specificImages = {
      "carbonara pasta":               "https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80",
      "pasta carbonara":               "https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80",
      "margherita pizza":              "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80",
      "pizza margarita":               "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80",
      "tacos al pastor":               "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80",
      "traditional guacamole":         "https://images.unsplash.com/photo-1541519227354-08fa5d50c820?auto=format&fit=crop&w=800&q=80",
      "chickpea curry":                "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=800&q=80",
      "buddha bowl":                   "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
      "sushi maki roll":               "https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80",
      "chicken ramen":                 "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80",
      "classic burger":                "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
      "bbq ribs":                      "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
      "tiramisu":                      "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80",
      "strawberry cheesecake":         "https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=800&q=80",
      "risotto ai funghi":             "https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=800&q=80",
      "lasagna bolognese":             "https://images.unsplash.com/photo-1619895092538-128341789043?auto=format&fit=crop&w=800&q=80",
      "gnocchi al pesto":              "https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=800&q=80",
      "ossobuco milanese":             "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
      "penne arrabbiata":              "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80",
      "saltimbocca alla romana":       "https://images.unsplash.com/photo-1607116667981-ff148a4394c7?auto=format&fit=crop&w=800&q=80",
      "focaccia genovese":             "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=800&q=80",
      "bruschetta al pomodoro":        "https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?auto=format&fit=crop&w=800&q=80",
      "enchiladas verdes":             "https://images.unsplash.com/photo-1534352956036-cd81e27dd615?auto=format&fit=crop&w=800&q=80",
      "pozole rojo":                   "https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?auto=format&fit=crop&w=800&q=80",
      "chiles rellenos":               "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80",
      "cochinita pibil":               "https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?auto=format&fit=crop&w=800&q=80",
      "sopa de lima":                  "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80",
      "tamales de rajas":              "https://images.unsplash.com/photo-1626514379926-c2af14cba2e2?auto=format&fit=crop&w=800&q=80",
      "quesadillas de flor de calabaza":"https://images.unsplash.com/photo-1565299507177-b0ac66763828?auto=format&fit=crop&w=800&q=80",
      "mole negro":                    "https://images.unsplash.com/photo-1553163147-622ab57be1c7?auto=format&fit=crop&w=800&q=80",
      "lentil dal":                    "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80",
      "mushroom tacos":                "https://images.unsplash.com/photo-1627308595229-7830a5c18106?auto=format&fit=crop&w=800&q=80",
      "falafel wrap":                  "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=800&q=80",
      "vegetable paella":              "https://images.unsplash.com/photo-1534080564583-6be75777b70a?auto=format&fit=crop&w=800&q=80",
      "stuffed bell peppers":          "https://images.unsplash.com/photo-1563699740773-cb7de04ba4dd?auto=format&fit=crop&w=800&q=80",
      "tofu stir fry":                 "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
      "cauliflower curry":             "https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=800&q=80",
      "avocado toast deluxe":          "https://images.unsplash.com/photo-1541519227354-08fa5d50c820?auto=format&fit=crop&w=800&q=80",
      "tonkatsu":                      "https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?auto=format&fit=crop&w=800&q=80",
      "gyoza":                         "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=800&q=80",
      "miso ramen":                    "https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=800&q=80",
      "yakitori":                      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80",
      "tempura udon":                  "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80",
      "karaage":                       "https://images.unsplash.com/photo-1562802378-063ec186a863?auto=format&fit=crop&w=800&q=80",
      "okonomiyaki":                   "https://images.unsplash.com/photo-1617196034183-421b4040ed20?auto=format&fit=crop&w=800&q=80",
      "beef teriyaki bowl":            "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
      "mac and cheese":                "https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=800&q=80",
      "buffalo wings":                 "https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80",
      "philly cheesesteak":            "https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=800&q=80",
      "clam chowder":                  "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80",
      "pulled pork sandwich":          "https://images.unsplash.com/photo-1558030089-8a11c5d46e0a?auto=format&fit=crop&w=800&q=80",
      "corn dog":                      "https://images.unsplash.com/photo-1619881590738-a111d176d906?auto=format&fit=crop&w=800&q=80",
      "lobster roll":                  "https://images.unsplash.com/photo-1565299507177-b0ac66763828?auto=format&fit=crop&w=800&q=80",
      "chicken and waffles":           "https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=800&q=80",
      "crème brûlée":                  "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?auto=format&fit=crop&w=800&q=80",
      "creme brulee":                  "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?auto=format&fit=crop&w=800&q=80",
      "chocolate lava cake":           "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80",
      "panna cotta":                   "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80",
      "apple pie":                     "https://images.unsplash.com/photo-1568571780765-9276ac8b75a2?auto=format&fit=crop&w=800&q=80",
      "profiteroles":                  "https://images.unsplash.com/photo-1530610476181-d83430b64dcd?auto=format&fit=crop&w=800&q=80",
      "churros con chocolate":         "https://images.unsplash.com/photo-1624371414361-e670edf4850e?auto=format&fit=crop&w=800&q=80",
      "mango sorbet":                  "https://images.unsplash.com/photo-1488900128323-21503983a07e?auto=format&fit=crop&w=800&q=80",
      "banana foster":                 "https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=800&q=80",
    };

    return specificImages[nameKey] || categoryImages[recipe.category?.toLowerCase()] || categoryImages.default;
  };

  // === BUSCAR EN UNSPLASH ===
  const searchUnsplash = async () => {
    if (!unsplashSearch) return;
    try {
      const res = await axios.get(`https://api.unsplash.com/search/photos`, {
        params: { query: unsplashSearch, per_page: 6, orientation: 'landscape' },
        headers: { Authorization: `Client-ID ${import.meta.env.VITE_UNSPLASH_ACCESS_KEY}` }
      });
      setUnsplashResults(res.data.results);
    } catch (err) {
      toast.error("Error buscando imágenes en Unsplash.");
    }
  };

  useEffect(() => {
    keycloak.init({ 
      onLoad: 'login-required', 
      checkLoginIframe: false,
      pkceMethod: 'S256',
      responseMode: 'query'
    }).then(auth => {
      setAuthenticated(auth);
      if (auth) {
        setUsername(keycloak.tokenParsed.preferred_username || "Chef");
        fetchData(keycloak.tokenParsed.sub).finally(() => setLoading(false));
      }
    }).catch(() => {
      toast.error("Authentication Error");
      setLoading(false);
    });
  }, []);

  const fetchRecommendations = async (userId, categoryOverride = null) => {
    if (!categoryOverride && !activeCategory) return;
    try {
      const url = `https://ltu-m7011e-5.se/recommendations/${userId}` + 
        (categoryOverride ? `?category=${categoryOverride}` : 
         activeCategory ? `?category=${activeCategory}` : '');
      const resRecs = await axios.get(url, {
        headers: { Authorization: `Bearer ${keycloak.token}` }
      });
      if (resRecs.data && resRecs.data.length > 0 && 
          resRecs.data[0] !== "Select a category to see your recommendation.") {
        setRecommendations(resRecs.data);
      }
    } catch (err) {
      console.error("Error loading recommendations", err);
    }
  };

  const fetchData = async (userId) => {
    try {
      const resRecipes = await axios.get('https://ltu-m7011e-5.se/recipes');
      const recipesData = Array.isArray(resRecipes.data)
        ? resRecipes.data
        : resRecipes.data.recipes || [];
      setRecipes(recipesData);
      applyFilters(recipesData, searchTerm, filterCategory, filterTime, filterRating);
      
      try {
        const userRes = await axios.get(`/users/${userId}`, {
          headers: { Authorization: `Bearer ${keycloak.token}` }
        });
        const savedPref = userRes.data.preference || userRes.data.category;
        if (savedPref) setActiveCategory(savedPref);
      } catch (e) {}

      await fetchRecommendations(userId);
    } catch (err) {
      console.error("Error loading data:", err);
    }
  };

  // ✅ applyFilters ahora acepta filterRating
  const applyFilters = (allRecipes, search, cat, time, rating) => {
    let result = allRecipes;

    if (search) {
      result = result.filter(r => 
        (r.name && r.name.toLowerCase().includes(search)) || 
        (r.category && r.category.toLowerCase().includes(search))
      );
    }
    if (cat !== "All") {
      result = result.filter(r => r.category === cat);
    }
    if (time !== "All") {
      if (time === "Short") result = result.filter(r => r.cookingTime && r.cookingTime <= 30);
      else if (time === "Long") result = result.filter(r => r.cookingTime && r.cookingTime > 30);
    }

    // ✅ Filtro por valoración
    if (rating === "rating_desc") {
      result = [...result].sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    } else if (rating === "rating_asc") {
      result = [...result].sort((a, b) => (a.averageRating || 0) - (b.averageRating || 0));
    }

    setFilteredRecipes(result);
  };

  const handleSearchChange = (e) => {
    const term = e.target.value.toLowerCase();
    setSearchTerm(term);
    applyFilters(recipes, term, filterCategory, filterTime, filterRating);
  };

  const handleCategoryFilterChange = (e) => {
    const cat = e.target.value;
    setFilterCategory(cat);
    applyFilters(recipes, searchTerm, cat, filterTime, filterRating);
  };

  const handleTimeFilterChange = (e) => {
    const time = e.target.value;
    setFilterTime(time);
    applyFilters(recipes, searchTerm, filterCategory, time, filterRating);
  };

  // ✅ NUEVO — manejar cambio de filtro de valoración
  const handleRatingFilterChange = (e) => {
    const rating = e.target.value;
    setFilterRating(rating);
    applyFilters(recipes, searchTerm, filterCategory, filterTime, rating);
  };

  const viewRecipeDetail = (recipe) => {
    setSelectedRecipe(recipe);
  };

  const updatePreferences = async (newPref) => { 
    setActiveCategory(newPref);
    const loadId = toast.loading(`Creating ${newPref} menu...`);
    try {
      await axios.post('/users/preferences', 
        { userId: keycloak.tokenParsed.sub, category: newPref },
        { headers: { Authorization: `Bearer ${keycloak.token}`, 'Content-Type': 'application/json' } }
      );
      await fetchRecommendations(keycloak.tokenParsed.sub, newPref);
      toast.success(`Monthly meal plan updated!`, { id: loadId });
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 1000);
    } catch (err) {
      toast.error("Error updating profile", { id: loadId });
    }
  };

  // === CREACIÓN DE RECETAS ===
  const handleCreateRecipe = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    let finalImageUrl = "";
    const loadId = toast.loading("Procesando receta...");

    try {
      if (imageOption === 'unsplash' && selectedImageUrl) {
        finalImageUrl = selectedImageUrl;
      } else if (imageOption === 'upload' && imageFile) {
        const imgData = new FormData();
        imgData.append('image', imageFile);
        const uploadRes = await axios.post('https://ltu-m7011e-5.se/recipes/upload-image', imgData, {
          headers: { 
            Authorization: `Bearer ${keycloak.token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        finalImageUrl = uploadRes.data.imageUrl;
      }

      const ingredientsText  = formData.get('ingredients') || "";
      const ingredientsArray = ingredientsText.split(',').map(item => item.trim());

      const payload = {
        name:         formData.get('name'),
        category:     formData.get('category'),
        description:  formData.get('description'),
        ingredients:  ingredientsArray,
        instructions: formData.get('instructions'),
        cookingTime:  formData.get('cookingTime'),
        imageUrl:     finalImageUrl
      };
      
      await axios.post('https://ltu-m7011e-5.se/recipes', payload, {
        headers: { 
          Authorization: `Bearer ${keycloak.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      toast.success("Receta publicada exitosamente!", { id: loadId });
      setShowModal(false);
      setImageOption('none');
      setSelectedImageUrl('');
      setImageFile(null);
      fetchData(keycloak.tokenParsed.sub);
      
    } catch (err) {
      console.error(err);
      toast.error("Error publicando. Revisa tu conexión.", { id: loadId });
    }
  };

  // ✅ DELETE — el backend ya valida que sea el autor; aquí solo mostramos el botón si es el autor
  const handleDeleteRecipe = async (id) => {
    if (!window.confirm("Are you sure you want to delete this recipe?")) return;
    try {
      await axios.delete(`https://ltu-m7011e-5.se/recipes/${id}`, {
        headers: { Authorization: `Bearer ${keycloak.token}` }
      });
      toast.success("Recipe deleted!");
      setSelectedRecipe(null);
      fetchData(keycloak.tokenParsed.sub);
    } catch (err) {
      const msg = err.response?.data?.error || "Can't delete the recipe.";
      toast.error(msg);
    }
  };

  // ✅ VALORAR RECETA
  const handleRateRecipe = async (recipeId, score) => {
    if (userRatings[recipeId] !== undefined) {
      toast.error("You have already rated this recipe.");
      return;
    }
    setRatingLoading(true);
    try {
      const res = await axios.post(
        `https://ltu-m7011e-5.se/recipes/${recipeId}/rate`,
        { score },
        { headers: { Authorization: `Bearer ${keycloak.token}`, 'Content-Type': 'application/json' } }
      );
      // Guardar voto del usuario en estado local
      setUserRatings(prev => ({ ...prev, [recipeId]: score }));

      // Actualizar la receta en el estado local con la nueva media
      const updatedRecipes = recipes.map(r =>
        r._id === recipeId
          ? { ...r, averageRating: res.data.averageRating, ratingCount: res.data.ratingCount }
          : r
      );
      setRecipes(updatedRecipes);
      applyFilters(updatedRecipes, searchTerm, filterCategory, filterTime, filterRating);

      // Actualizar también la receta en el modal
      setSelectedRecipe(prev => prev && prev._id === recipeId
        ? { ...prev, averageRating: res.data.averageRating, ratingCount: res.data.ratingCount }
        : prev
      );

      toast.success(`You rated this recipe ${score}/10!`);
    } catch (err) {
      const msg = err.response?.data?.error || "Error saving your rating.";
      if (err.response?.status === 409) {
        toast.error("You have already rated this recipe.");
        setUserRatings(prev => ({ ...prev, [recipeId]: -1 })); // marcar como votado
      } else {
        toast.error(msg);
      }
    } finally {
      setRatingLoading(false);
    }
  };

  const currentUserId = keycloak.tokenParsed?.sub;

  if (loading) return <div className="loader-container"><div className="spinner"></div></div>;

  return (
    <div className="app-container">
      <Toaster position="top-right" />

      <header className="main-header">
        <div className="logo-text">ChefMatch</div>
        <div className="header-search">
          <input 
            type="text" 
            placeholder="Search recipes..." 
            value={searchTerm}
            onChange={handleSearchChange}
            className="modern-search-input"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="user-badge">
            <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>STUDENT</span>
            <span style={{ fontWeight: '800' }}>{username.toUpperCase()}</span>
          </div>
          <button onClick={() => keycloak.logout()} className="logout-btn">LOGOUT</button>
        </div>
      </header>

      <main style={{ padding: '2rem 3rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        
        {/* CATEGORY SELECTION */}
        <div style={{ marginBottom: '3rem' }}>
          <h3 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🎭 What are you craving today? <span style={{ fontSize: '0.8rem', opacity: 0.6, fontWeight: 'normal' }}>(Select your mood)</span>
          </h3>
          <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '20px', justifyContent: 'flex-start' }}>
            {cuisineStyles.map((cuisine) => {
              const isActive = activeCategory === cuisine.name;
              return (
                <div key={cuisine.name} onClick={() => updatePreferences(cuisine.name)}
                  style={{ cursor: 'pointer', minWidth: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', transition: 'all 0.3s ease', transform: isActive ? 'translateY(-5px) scale(1.05)' : 'none', opacity: activeCategory && !isActive ? 0.6 : 1 }}
                  className="cuisine-card">
                  <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: cuisine.color, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '2rem', boxShadow: isActive ? `0 0 20px ${cuisine.color}` : '0 5px 15px rgba(0,0,0,0.3)', border: isActive ? '3px solid #fff' : 'none', transition: 'all 0.3s ease' }}>
                    {cuisine.icon}
                  </div>
                  <span style={{ color: isActive ? '#f97316' : '#94a3b8', fontWeight: isActive ? 'bold' : 'normal', fontSize: '0.9rem' }}>{cuisine.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* SINGULAR RECOMMENDATION */}
        {recommendations.length > 0 && recommendations[0] !== "Select a category to see your recommendation." && (
          <div className="glass-panel" style={{ borderLeft: '5px solid #f97316', marginBottom: '3rem', background: 'linear-gradient(90deg, rgba(249,115,22,0.1) 0%, rgba(30,41,59,0.5) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h4 style={{ color: '#f97316', margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>ChefMatch Recommends</h4>
              <h2 style={{ color: '#fff', margin: '5px 0 0 0', fontSize: '1.8rem' }}>{recommendations[0]}</h2>
            </div>
            <div style={{ fontSize: '3rem', opacity: 0.2 }}>✨</div>
          </div>
        )}

        <MonthlyMealPlan 
          keycloak={keycloak} 
          activeCategory={activeCategory} 
          recipes={recipes} 
        />

        {/* EXPLORE MENU WITH FILTERS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '2rem' }}>Explore Menu</h2>
          <button onClick={() => setShowModal(true)} className="btn-create">+ Add Recipe</button>
        </div>

        {/* ✅ FILTROS: categoría + tiempo + valoración */}
        <div className="glass-panel" style={{ padding: '1rem', marginBottom: '2rem', display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ color: '#cbd5e1' }}>📂 Category:</span>
            <select value={filterCategory} onChange={handleCategoryFilterChange} className="form-input" style={{ width: '150px', margin: 0, padding: '5px 10px' }}>
              <option value="All">All</option>
              <option value="Italian">Italian</option>
              <option value="Mexican">Mexican</option>
              <option value="Vegan">Vegan</option>
              <option value="Japanese">Japanese</option>
              <option value="American">American</option>
              <option value="Desserts">Desserts</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ color: '#cbd5e1' }}>⏱️ Time:</span>
            <select value={filterTime} onChange={handleTimeFilterChange} className="form-input" style={{ width: '150px', margin: 0, padding: '5px 10px' }}>
              <option value="All">All</option>
              <option value="Short">Short (≤30m)</option>
              <option value="Long">Long (&gt;30m)</option>
            </select>
          </div>
          {/* ✅ NUEVO filtro de valoración */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ color: '#cbd5e1' }}>⭐ Rating:</span>
            <select value={filterRating} onChange={handleRatingFilterChange} className="form-input" style={{ width: '180px', margin: 0, padding: '5px 10px' }}>
              <option value="All">All</option>
              <option value="rating_desc">Highest rated first</option>
              <option value="rating_asc">Lowest rated first</option>
            </select>
          </div>
        </div>

        {/* RECIPE GRID */}
        <div className="recipe-grid">
          {filteredRecipes.map((recipe, index) => (
            <div key={recipe._id || index} className="glass-panel recipe-card">
              <div className="recipe-image-container">
                <img src={getRecipeImage(recipe)} alt={recipe.name} className="recipe-img" />
                <span className="badge-floating">{recipe.category}</span>
                <span className="badge-floating" style={{ right: 'auto', left: '10px', background: 'rgba(0,0,0,0.7)' }}>⏱️ {recipe.cookingTime || 30} min</span>
              </div>
              <div style={{ padding: '1.2rem' }}>
                <h4 style={{ fontSize: '1.4rem', color: '#fff' }}>{recipe.name}</h4>
                {/* ✅ Muestra valoración en la tarjeta */}
                <div style={{ margin: '6px 0 8px 0' }}>
                  <RatingDisplay average={recipe.averageRating || 0} count={recipe.ratingCount || 0} />
                </div>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '6px 0', lineHeight: '1.4' }}>
                  {recipe.description 
                    ? (recipe.description.length > 60 ? recipe.description.substring(0, 60) + "..." : recipe.description)
                    : "Click below to see details."
                  }
                </p>
                <button onClick={() => viewRecipeDetail(recipe)} className="btn-create" style={{ padding: '8px 15px', fontSize: '0.75rem', marginTop: '5px' }}>View Full Recipe</button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* MODAL: NUEVA RECETA */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-box">
            <h3>New Recipe</h3>
            <form onSubmit={handleCreateRecipe} style={{ marginTop: '1rem' }}>
              <input name="name" placeholder="Title" required className="form-input" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <select name="category" className="form-input">
                  <option value="Italian">Italian</option>
                  <option value="Mexican">Mexican</option>
                  <option value="Vegan">Vegan</option>
                  <option value="Japanese">Japanese</option>
                  <option value="American">American</option>
                  <option value="Desserts">Desserts</option>
                </select>
                <input name="cookingTime" type="number" placeholder="Minutes (e.g. 30)" required className="form-input" />
              </div>
              <textarea name="description" placeholder="Short description..." required className="form-input" rows="2" />
              <textarea name="ingredients" placeholder="Ingredients (comma separated)..." required className="form-input" rows="3" />
              <textarea name="instructions" placeholder="Step-by-step instructions..." required className="form-input" rows="5" />
              
              {/* SECCIÓN DE IMAGEN */}
              <div style={{ margin: '15px 0', border: '1px solid rgba(255,255,255,0.1)', padding: '15px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
                <p style={{ margin: '0 0 10px 0', color: '#cbd5e1', fontWeight: 'bold' }}>Add Image (Optional)</p>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
                  <label style={{ cursor: 'pointer' }}><input type="radio" name="imgOpt" checked={imageOption === 'none'} onChange={() => setImageOption('none')} /> None</label>
                  <label style={{ cursor: 'pointer' }}><input type="radio" name="imgOpt" checked={imageOption === 'unsplash'} onChange={() => setImageOption('unsplash')} /> Search Online</label>
                  <label style={{ cursor: 'pointer' }}><input type="radio" name="imgOpt" checked={imageOption === 'upload'} onChange={() => setImageOption('upload')} /> Upload Photo</label>
                </div>
                
                {imageOption === 'unsplash' && (
                  <div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input type="text" value={unsplashSearch} onChange={(e) => setUnsplashSearch(e.target.value)} placeholder="e.g. Pasta, Tacos, Burger..." className="form-input" style={{ margin: 0 }} />
                      <button type="button" onClick={searchUnsplash} className="btn-modern" style={{ padding: '0 15px' }}>Search</button>
                    </div>
                    {unsplashResults.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '15px' }}>
                        {unsplashResults.map(img => (
                          <img key={img.id} src={img.urls.small} alt="Result"
                            onClick={() => setSelectedImageUrl(img.urls.regular)}
                            style={{ width: '100%', height: '80px', objectFit: 'cover', cursor: 'pointer', border: selectedImageUrl === img.urls.regular ? '3px solid #f97316' : '2px solid transparent', borderRadius: '6px', transition: 'all 0.2s' }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {imageOption === 'upload' && (
                  <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} className="form-input" style={{ padding: '10px' }} />
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" className="btn-create">Publish</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-modern">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DETALLE DE RECETA */}
      {selectedRecipe && (
        <div className="modal-overlay">
          <div className="glass-panel modal-box" style={{ maxWidth: '700px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '2rem', color: '#f97316', margin: 0 }}>{selectedRecipe.name}</h3>
              <button onClick={() => setSelectedRecipe(null)} className="btn-modern" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', fontSize: '1.2rem', padding: '5px 15px' }}>✕</button>
            </div>
            <img src={getRecipeImage(selectedRecipe)} alt={selectedRecipe.name} style={{ width: '100%', height: '300px', objectFit: 'cover', borderRadius: '12px', marginBottom: '1.5rem' }} />
            <div style={{ display: 'flex', gap: '15px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ background: 'rgba(249,115,22,0.2)', color: '#f97316', padding: '5px 10px', borderRadius: '5px', fontWeight: 'bold' }}>📂 {selectedRecipe.category}</span>
              <span style={{ background: 'rgba(255,255,255,0.1)', padding: '5px 10px', borderRadius: '5px' }}>⏱️ {selectedRecipe.cookingTime || 30} min</span>
            </div>

            {/* ✅ SECCIÓN DE VALORACIÓN EN EL MODAL */}
            <div className="glass-panel" style={{ padding: '1.2rem', marginBottom: '1.5rem', background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ color: '#f97316', margin: 0, fontSize: '1rem' }}>⭐ Community Rating</h4>
                <RatingDisplay 
                  average={selectedRecipe.averageRating || 0} 
                  count={selectedRecipe.ratingCount || 0} 
                />
              </div>

              {userRatings[selectedRecipe._id] !== undefined ? (
                <div style={{ color: '#94a3b8', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#38ef7d' }}>✓</span>
                  You rated this recipe <strong style={{ color: '#f97316' }}>
                    {userRatings[selectedRecipe._id] === -1 ? 'already' : `${userRatings[selectedRecipe._id]}/10`}
                  </strong>. Thank you!
                </div>
              ) : (
                <div>
                  <p style={{ color: '#cbd5e1', fontSize: '0.85rem', margin: '0 0 10px 0' }}>Rate this recipe (0–10):</p>
                  <RatingSelector
                    onRate={(score) => handleRateRecipe(selectedRecipe._id, score)}
                    disabled={ratingLoading}
                  />
                </div>
              )}
            </div>

            <p style={{ fontStyle: 'italic', marginBottom: '2rem', color: '#cbd5e1', fontSize: '1.1rem', lineHeight: '1.6' }}>{selectedRecipe.description}</p>
            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ color: '#fff', borderBottom: '2px solid #f97316', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'inline-block' }}>🥘 Ingredients</h4>
              <ul style={{ paddingLeft: '0', listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                {selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0 ? (
                  selectedRecipe.ingredients.map((ing, i) => (
                    <li key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', color: '#e2e8f0' }}>• {ing}</li>
                  ))
                ) : (
                  <li style={{ color: '#94a3b8' }}>No detailed ingredients specified.</li>
                )}
              </ul>
            </div>
            <div>
              <h4 style={{ color: '#fff', borderBottom: '2px solid #f97316', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'inline-block' }}>📝 Step-by-Step Instructions</h4>
              <div style={{ color: '#e2e8f0', whiteSpace: 'pre-line', lineHeight: '1.8', background: 'rgba(30, 41, 59, 0.5)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                {selectedRecipe.instructions || "No detailed instructions for this recipe."}
              </div>
            </div>

            {/* ✅ BOTÓN BORRAR — solo visible si el usuario actual es el autor */}
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
              {selectedRecipe._id &&
               typeof selectedRecipe._id === 'string' &&
               selectedRecipe._id.length > 5 &&
               selectedRecipe.userId === currentUserId ? (
                <button
                  onClick={() => handleDeleteRecipe(selectedRecipe._id)}
                  className="btn-modern"
                  style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid #ef4444' }}
                >
                  Delete Recipe
                </button>
              ) : <div></div>}
              <button onClick={() => setSelectedRecipe(null)} className="btn-create" style={{ padding: '10px 30px' }}>
                Close Recipe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
