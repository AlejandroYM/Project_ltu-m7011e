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

/* ── RatingDisplay ─────────────────────────────────────────────────── */
function RatingDisplay({ average, count }) {
  const filled = Math.round(average);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '2px' }}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} style={{
            fontSize: '0.65rem',
            color: i < filled ? '#c45c35' : '#d8d0c4',
            lineHeight: 1
          }}>●</span>
        ))}
      </div>
      <span style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: '1.1rem',
        color: '#c45c35',
        letterSpacing: '0.04em',
        lineHeight: 1
      }}>
        {average > 0 ? average.toFixed(1) : '—'}
      </span>
      <span style={{ color: '#8c7d6e', fontSize: '0.65rem' }}>({count})</span>
    </div>
  );
}

/* ── RatingSelector ────────────────────────────────────────────────── */
function RatingSelector({ onRate, disabled }) {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);

  const handleRate = (score) => {
    if (disabled) return;
    setSelected(score);
    onRate(score);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
      {Array.from({ length: 11 }, (_, i) => (
        <button
          key={i}
          onClick={() => handleRate(i)}
          onMouseEnter={() => !disabled && setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          disabled={disabled}
          style={{
            width: '34px',
            height: '34px',
            border: selected === i
              ? '2px solid #c45c35'
              : '1.5px solid #d8d0c4',
            background: (hovered !== null ? i <= hovered : selected !== null && i <= selected)
              ? 'rgba(196,92,53,0.18)'
              : '#f2ede6',
            color: '#1a1410',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: '700',
            fontSize: '0.75rem',
            transition: 'all 0.12s',
            opacity: disabled ? 0.5 : 1
          }}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
function App() {
  const [authenticated, setAuthenticated]     = useState(false);
  const [recipes, setRecipes]                 = useState([]);
  const [filteredRecipes, setFilteredRecipes] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [username, setUsername]               = useState("");
  const [loading, setLoading]                 = useState(true);
  const [searchTerm, setSearchTerm]           = useState("");

  const [filterCategory, setFilterCategory]   = useState("All");
  const [filterTime, setFilterTime]           = useState("All");
  const [filterRating, setFilterRating]       = useState("All");

  const [showModal, setShowModal]             = useState(false);
  const [selectedRecipe, setSelectedRecipe]   = useState(null);
  const [activeCategory, setActiveCategory]   = useState(null);

  const [ratingLoading, setRatingLoading]     = useState(false);
  const [userRatings, setUserRatings]         = useState({});

  const [imageOption, setImageOption]         = useState('none');
  const [unsplashSearch, setUnsplashSearch]   = useState('');
  const [unsplashResults, setUnsplashResults] = useState([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [imageFile, setImageFile]             = useState(null);

  // Recipe index counter for cards
  const [recipeIndex, setRecipeIndex] = useState({});

  const cuisines = [
    { name: 'Italian',  icon: '🍝' },
    { name: 'Mexican',  icon: '🌮' },
    { name: 'Vegan',    icon: '🥗' },
    { name: 'Japanese', icon: '🍣' },
    { name: 'American', icon: '🍔' },
    { name: 'Desserts', icon: '🧁' },
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
    const nameKey = recipe.name.toLowerCase().trim();
    const specificImages = {
      "carbonara pasta":                "https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80",
      "pasta carbonara":                "https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80",
      "margherita pizza":               "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80",
      "tacos al pastor":                "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80",
      "traditional guacamole":          "https://images.unsplash.com/photo-1600335895229-6e75511892c8?auto=format&fit=crop&w=800&q=80",
      "chickpea curry":                 "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=800&q=80",
      "buddha bowl":                    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
      "sushi maki roll":                "https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80",
      "chicken ramen":                  "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80",
      "classic burger":                 "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
      "bbq ribs":                       "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
      "tiramisu":                       "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80",
      "strawberry cheesecake":          "https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=800&q=80",
      "risotto ai funghi":              "https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=800&q=80",
      "lasagna bolognese":              "https://images.unsplash.com/photo-1619895092538-128341789043?auto=format&fit=crop&w=800&q=80",
      "gnocchi al pesto":               "https://images.unsplash.com/photo-1551183053-bf91798d047d?auto=format&fit=crop&w=800&q=80",
      "penne arrabbiata":               "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80",
      "focaccia genovese":              "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
      "bruschetta al pomodoro":         "https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?auto=format&fit=crop&w=800&q=80",
      "saltimbocca alla romana":        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
      "ossobuco milanese":              "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=800&q=80",
      "enchiladas verdes":              "https://images.unsplash.com/photo-1534352956036-cd81e27dd615?auto=format&fit=crop&w=800&q=80",
      "chiles rellenos":                "https://images.unsplash.com/photo-1617611413012-715a1c4b4c0f?auto=format&fit=crop&w=800&q=80",
      "tamales de rajas":               "https://images.unsplash.com/photo-1625944525533-473f1a3d54e7?auto=format&fit=crop&w=800&q=80",
      "quesadillas de flor de calabaza":"https://images.unsplash.com/photo-1618040996337-56904b7850b9?auto=format&fit=crop&w=800&q=80",
      "mushroom tacos":                 "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80",
      "sopa de lima":                   "https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?auto=format&fit=crop&w=800&q=80",
      "cochinita pibil":                "https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?auto=format&fit=crop&w=800&q=80",
      "lentil dal":                     "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80",
      "falafel wrap":                   "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=800&q=80",
      "stuffed bell peppers":           "https://images.unsplash.com/photo-1563699740773-cb7de04ba4dd?auto=format&fit=crop&w=800&q=80",
      "avocado toast deluxe":           "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
      "vegetable paella":               "https://images.unsplash.com/photo-1534080564583-6be75777b70a?auto=format&fit=crop&w=800&q=80",
      "tonkatsu":                       "https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?auto=format&fit=crop&w=800&q=80",
      "karaage":                        "https://images.unsplash.com/photo-1562802378-063ec186a863?auto=format&fit=crop&w=800&q=80",
      "okonomiyaki":                    "https://images.unsplash.com/photo-1617196034183-421b4040ed20?auto=format&fit=crop&w=800&q=80",
      "gyoza":                          "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=800&q=80",
      "miso ramen":                     "https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=800&q=80",
      "yakitori":                       "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80",
      "mac and cheese":                 "https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=800&q=80",
      "philly cheesesteak":             "https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=800&q=80",
      "buffalo wings":                  "https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80",
      "pulled pork sandwich":           "https://images.unsplash.com/photo-1558030089-8a11c5d46e0a?auto=format&fit=crop&w=800&q=80",
      "lobster roll":                   "https://images.unsplash.com/photo-1569054474823-4afe79fbaee4?auto=format&fit=crop&w=800&q=80",
      "crème brûlée":                   "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?auto=format&fit=crop&w=800&q=80",
      "creme brulee":                   "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?auto=format&fit=crop&w=800&q=80",
      "profiteroles":                   "https://images.unsplash.com/photo-1530610476181-d83430b64dcd?auto=format&fit=crop&w=800&q=80",
      "churros con chocolate":          "https://images.unsplash.com/photo-1624371414361-e670edf4850e?auto=format&fit=crop&w=800&q=80",
      "chocolate lava cake":            "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80",
      "apple pie":                      "https://images.unsplash.com/photo-1568571780765-9276ac8b75a2?auto=format&fit=crop&w=800&q=80",
      "mango sorbet":                   "https://images.unsplash.com/photo-1488900128323-21503983a07e?auto=format&fit=crop&w=800&q=80",
      "banana foster":                  "https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=800&q=80",
      "beef teriyaki bowl":             "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
    };
    // specificImages takes priority over stored imageUrl to ensure correct matching
    return specificImages[nameKey] || recipe.imageUrl || categoryImages[recipe.category?.toLowerCase()] || categoryImages.default;
  };

  const searchUnsplash = async () => {
    if (!unsplashSearch) return;
    try {
      const res = await axios.get(`https://api.unsplash.com/search/photos`, {
        params: { query: unsplashSearch, per_page: 6, orientation: 'landscape' },
        headers: { Authorization: `Client-ID ${import.meta.env.VITE_UNSPLASH_ACCESS_KEY}` }
      });
      setUnsplashResults(res.data.results);
    } catch {
      toast.error("Error searching images.");
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
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${keycloak.token}` } });
      if (res.data?.length > 0 && res.data[0] !== "Select a category to see your recommendation.") {
        setRecommendations(res.data);
      }
    } catch { /* silent */ }
  };

  const fetchData = async (userId) => {
    try {
      const resRecipes = await axios.get('https://ltu-m7011e-5.se/recipes');
      const data = Array.isArray(resRecipes.data) ? resRecipes.data : resRecipes.data.recipes || [];
      setRecipes(data);
      applyFilters(data, searchTerm, filterCategory, filterTime, filterRating);
      try {
        const userRes = await axios.get(`/users/${userId}`, { headers: { Authorization: `Bearer ${keycloak.token}` } });
        const pref = userRes.data.preference || userRes.data.category;
        if (pref) setActiveCategory(pref);
      } catch { /* silent */ }
      await fetchRecommendations(userId);
    } catch (err) {
      console.error("Error loading data:", err);
    }
  };

  const applyFilters = (all, search, cat, time, rating) => {
    let r = all;
    if (search) r = r.filter(x =>
      (x.name?.toLowerCase().includes(search)) ||
      (x.category?.toLowerCase().includes(search))
    );
    if (cat !== "All") r = r.filter(x => x.category === cat);
    if (time === "Short") r = r.filter(x => x.cookingTime && x.cookingTime <= 30);
    else if (time === "Long") r = r.filter(x => x.cookingTime && x.cookingTime > 30);
    if (rating === "rating_desc") r = [...r].sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    else if (rating === "rating_asc") r = [...r].sort((a, b) => (a.averageRating || 0) - (b.averageRating || 0));
    setFilteredRecipes(r);
  };

  const handleSearchChange = (e) => {
    const t = e.target.value.toLowerCase();
    setSearchTerm(t);
    applyFilters(recipes, t, filterCategory, filterTime, filterRating);
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
    } catch {
      toast.error("Error updating profile", { id: loadId });
    }
  };

  const handleCreateRecipe = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    let finalImageUrl = "";
    const loadId = toast.loading("Processing recipe...");
    try {
      if (imageOption === 'unsplash' && selectedImageUrl) {
        finalImageUrl = selectedImageUrl;
      } else if (imageOption === 'upload' && imageFile) {
        const imgData = new FormData();
        imgData.append('image', imageFile);
        const uploadRes = await axios.post('https://ltu-m7011e-5.se/recipes/upload-image', imgData, {
          headers: { Authorization: `Bearer ${keycloak.token}`, 'Content-Type': 'multipart/form-data' }
        });
        finalImageUrl = uploadRes.data.imageUrl;
      }
      const ingredients = (formData.get('ingredients') || "").split(',').map(s => s.trim());
      await axios.post('https://ltu-m7011e-5.se/recipes', {
        name: formData.get('name'),
        category: formData.get('category'),
        description: formData.get('description'),
        ingredients,
        instructions: formData.get('instructions'),
        cookingTime: formData.get('cookingTime'),
        imageUrl: finalImageUrl
      }, { headers: { Authorization: `Bearer ${keycloak.token}`, 'Content-Type': 'application/json' } });

      toast.success("Recipe published!", { id: loadId });
      setShowModal(false);
      setImageOption('none');
      setSelectedImageUrl('');
      setImageFile(null);
      fetchData(keycloak.tokenParsed.sub);
    } catch {
      toast.error("Error publishing. Check your connection.", { id: loadId });
    }
  };

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
      toast.error(err.response?.data?.error || "Can't delete this recipe.");
    }
  };

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
      setUserRatings(prev => ({ ...prev, [recipeId]: score }));
      const updated = recipes.map(r =>
        r._id === recipeId ? { ...r, averageRating: res.data.averageRating, ratingCount: res.data.ratingCount } : r
      );
      setRecipes(updated);
      applyFilters(updated, searchTerm, filterCategory, filterTime, filterRating);
      setSelectedRecipe(prev => prev?._id === recipeId
        ? { ...prev, averageRating: res.data.averageRating, ratingCount: res.data.ratingCount }
        : prev
      );
      toast.success(`Rated ${score}/10!`);
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error("You have already rated this recipe.");
        setUserRatings(prev => ({ ...prev, [recipeId]: -1 }));
      } else {
        toast.error(err.response?.data?.error || "Error saving rating.");
      }
    } finally {
      setRatingLoading(false);
    }
  };

  const currentUserId = keycloak.tokenParsed?.sub;

  if (loading) return (
    <div className="loader-container">
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.5rem', color: '#c45c35', letterSpacing: '0.1em', marginBottom: '16px' }}>
        CHEF<span style={{ color: '#1a1410' }}>MATCH</span>
      </div>
      <div className="spinner" />
    </div>
  );

  return (
    <div className="app-container">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#f2ede6',
            color: '#1a1410',
            border: '1.5px solid #d8d0c4',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '0.78rem',
            borderRadius: 0,
          },
        }}
      />

      {/* ── TICKER ── */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          <span>★ CHEFMATCH — YOUR CULINARY COMPANION</span><span>·</span>
          <span>60 RECIPES AVAILABLE</span><span>·</span>
          <span>RATE FROM 0 TO 10</span><span>·</span>
          <span>DRAG &amp; DROP MEAL PLANNER</span><span>·</span>
          <span>FEBRUARY 2026</span><span>·</span>
          <span>★ CHEFMATCH — YOUR CULINARY COMPANION</span><span>·</span>
          <span>60 RECIPES AVAILABLE</span><span>·</span>
          <span>RATE FROM 0 TO 10</span><span>·</span>
          <span>DRAG &amp; DROP MEAL PLANNER</span><span>·</span>
          <span>FEBRUARY 2026</span><span>·</span>
        </div>
      </div>

      {/* ── HEADER ── */}
      <header className="main-header">
        <div className="logo-wrap">
          <div className="logo-text">CHEF<span>MATCH</span></div>
        </div>

        <div className="header-search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search recipes or cuisines..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="modern-search-input"
          />
        </div>

        <div className="header-right">
          <div className="user-badge">
            <span className="user-role">Student</span>
            <span className="user-name">{username.toUpperCase()}</span>
          </div>
          <button onClick={() => keycloak.logout()} className="logout-btn">Exit</button>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="main-content">

        {/* CUISINE SELECTOR */}
        <div className="cat-row">
          {cuisines.map(c => (
            <div
              key={c.name}
              className={`cat-item${activeCategory === c.name ? ' active' : ''}`}
              onClick={() => updatePreferences(c.name)}
            >
              <span className="cat-emoji">{c.icon}</span>
              <span className="cat-icon-label">{c.name}</span>
            </div>
          ))}
        </div>

        {/* RECOMMENDATION BANNER */}
        {recommendations.length > 0 &&
          recommendations[0] !== "Select a category to see your recommendation." && (
          <div className="rec-banner">
            <div>
              <div className="rec-banner-label">ChefMatch Recommends</div>
              <div className="rec-banner-name">{recommendations[0]}</div>
            </div>
            <div className="rec-banner-icon">✦</div>
          </div>
        )}

        {/* MONTHLY MEAL PLAN */}
        <MonthlyMealPlan
          keycloak={keycloak}
          activeCategory={activeCategory}
          recipes={recipes}
          onRecipeClick={(r) => setSelectedRecipe(r)}
        />

        {/* EXPLORE BAR */}
        <div className="section-bar">
          <div className="section-title">EXPLORE MENU</div>
          <div className="filter-strip">
            <button
              className={`f-chip${filterCategory === 'All' && filterTime === 'All' && filterRating === 'All' ? ' active' : ''}`}
              onClick={() => {
                setFilterCategory('All'); setFilterTime('All'); setFilterRating('All');
                applyFilters(recipes, searchTerm, 'All', 'All', 'All');
              }}
            >All</button>

            {['Italian','Mexican','Vegan','Japanese','American','Desserts'].map(cat => (
              <button
                key={cat}
                className={`f-chip${filterCategory === cat ? ' active' : ''}`}
                onClick={() => { setFilterCategory(cat); applyFilters(recipes, searchTerm, cat, filterTime, filterRating); }}
              >{cat}</button>
            ))}

            <button
              className={`f-chip${filterTime === 'Short' ? ' active' : ''}`}
              onClick={() => { const t = filterTime === 'Short' ? 'All' : 'Short'; setFilterTime(t); applyFilters(recipes, searchTerm, filterCategory, t, filterRating); }}
            >⏱ ≤30m</button>

            <button
              className={`f-chip${filterRating === 'rating_desc' ? ' active' : ''}`}
              onClick={() => { const r = filterRating === 'rating_desc' ? 'All' : 'rating_desc'; setFilterRating(r); applyFilters(recipes, searchTerm, filterCategory, filterTime, r); }}
            >⭐ Top rated</button>

          </div>
          <button onClick={() => setShowModal(true)} className="f-chip-add">+ New Recipe</button>
        </div>

        {/* RECIPE GRID */}
        <div className="recipe-grid">
          {filteredRecipes.map((recipe, index) => (
            <div key={recipe._id || index} className="recipe-card">
              <div className="recipe-image-container">
                <img src={getRecipeImage(recipe)} alt={recipe.name} className="recipe-img" />
                <span className="badge-floating">{recipe.category}</span>
                <span className="badge-floating left">⏱ {recipe.cookingTime || 30}m</span>
              </div>
              <div className="card-body">
                <div className="card-num">
                  {String(index + 1).padStart(3, '0')} // {recipe.category?.toUpperCase()}
                </div>
                <div className="card-name">{recipe.name}</div>
                <div className="card-rating-row">
                  <RatingDisplay average={recipe.averageRating || 0} count={recipe.ratingCount || 0} />
                </div>
                <p className="card-desc">
                  {recipe.description
                    ? (recipe.description.length > 72 ? recipe.description.substring(0, 72) + "…" : recipe.description)
                    : "Click to view full recipe details."
                  }
                </p>
                <div className="card-meta">
                  <span className="card-tag accent">{recipe.cookingTime || 30} min</span>
                  {recipe.averageRating > 0 && (
                    <span className="card-tag accent2">★ {recipe.averageRating.toFixed(1)}</span>
                  )}
                </div>
                <button onClick={() => setSelectedRecipe(recipe)} className="btn-create">
                  View Recipe →
                </button>
              </div>
            </div>
          ))}
        </div>

      </main>

      {/* ── MODAL: NEW RECIPE ── */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-title">NEW RECIPE</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCreateRecipe}>
                <label className="form-label">Recipe Title</label>
                <input name="name" placeholder="e.g. Carbonara Pasta" required className="form-input" />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="form-label">Category</label>
                    <select name="category" className="form-input" style={{ marginBottom: 0 }}>
                      {['Italian','Mexican','Vegan','Japanese','American','Desserts'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Cooking time (min)</label>
                    <input name="cookingTime" type="number" placeholder="30" required className="form-input" style={{ marginBottom: 0 }} />
                  </div>
                </div>
                <div style={{ marginBottom: '12px' }} />

                <label className="form-label">Description</label>
                <textarea name="description" placeholder="Short description…" required className="form-input" rows="2" />

                <label className="form-label">Ingredients (comma separated)</label>
                <textarea name="ingredients" placeholder="Pasta, eggs, guanciale, pecorino…" required className="form-input" rows="3" />

                <label className="form-label">Step-by-step instructions</label>
                <textarea name="instructions" placeholder="1. Boil water…" required className="form-input" rows="5" />

                {/* IMAGE */}
                <div className="form-section">
                  <div className="form-section-title">Image (optional)</div>
                  <div className="radio-row">
                    <label><input type="radio" name="imgOpt" checked={imageOption === 'none'} onChange={() => setImageOption('none')} /> None</label>
                    <label><input type="radio" name="imgOpt" checked={imageOption === 'unsplash'} onChange={() => setImageOption('unsplash')} /> Search Online</label>
                    <label><input type="radio" name="imgOpt" checked={imageOption === 'upload'} onChange={() => setImageOption('upload')} /> Upload</label>
                  </div>

                  {imageOption === 'unsplash' && (
                    <div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          value={unsplashSearch}
                          onChange={e => setUnsplashSearch(e.target.value)}
                          placeholder="e.g. pasta, tacos…"
                          className="form-input"
                          style={{ marginBottom: 0, flex: 1 }}
                        />
                        <button type="button" onClick={searchUnsplash} className="btn-create">Search</button>
                      </div>
                      {unsplashResults.length > 0 && (
                        <div className="unsplash-grid">
                          {unsplashResults.map(img => (
                            <img
                              key={img.id}
                              src={img.urls.small}
                              alt="result"
                              className={`unsplash-img${selectedImageUrl === img.urls.regular ? ' selected' : ''}`}
                              onClick={() => setSelectedImageUrl(img.urls.regular)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {imageOption === 'upload' && (
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => setImageFile(e.target.files[0])}
                      className="form-input"
                      style={{ padding: '10px' }}
                    />
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="submit" className="btn-create">Publish Recipe</button>
                  <button type="button" onClick={() => setShowModal(false)} className="btn-modern">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: RECIPE DETAIL ── */}
      {selectedRecipe && (
        <div className="modal-overlay">
          <div className="modal-box detail-modal" style={{ maxWidth: '700px', width: '90%' }}>

            {/* Header */}
            <div className="modal-header">
              <div className="modal-title" style={{ fontSize: '1.5rem' }}>{selectedRecipe.name}</div>
              <button className="modal-close" onClick={() => setSelectedRecipe(null)}>✕</button>
            </div>

            {/* Image */}
            <img
              src={getRecipeImage(selectedRecipe)}
              alt={selectedRecipe.name}
              className="detail-img"
            />

            {/* Meta row */}
            <div className="detail-meta-row">
              <div className="detail-meta-item">
                <span>Category</span>
                <strong>{selectedRecipe.category}</strong>
              </div>
              <div className="detail-meta-item">
                <span>Cooking time</span>
                <strong>{selectedRecipe.cookingTime || 30} min</strong>
              </div>
              <div className="detail-meta-item" style={{ flex: 1 }}>
                <span>Community rating</span>
                <RatingDisplay average={selectedRecipe.averageRating || 0} count={selectedRecipe.ratingCount || 0} />
              </div>
            </div>

            {/* Rating panel */}
            <div className="rating-panel">
              <div className="rating-panel-title">
                <span>Rate this recipe (0–10)</span>
              </div>
              {userRatings[selectedRecipe._id] !== undefined ? (
                <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: '0.8rem', color: '#8c7d6e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#c45c35' }}>✓</span>
                  You rated this recipe{' '}
                  <strong style={{ color: '#c45c35' }}>
                    {userRatings[selectedRecipe._id] === -1 ? 'already' : `${userRatings[selectedRecipe._id]}/10`}
                  </strong>. Thank you!
                </div>
              ) : (
                <RatingSelector
                  onRate={score => handleRateRecipe(selectedRecipe._id, score)}
                  disabled={ratingLoading}
                />
              )}
            </div>

            <div className="modal-body">
              {/* Description */}
              <p style={{ fontFamily: "'IBM Plex Mono'", fontSize: '0.85rem', color: '#8c7d6e', lineHeight: '1.7', marginBottom: '24px', fontStyle: 'italic' }}>
                {selectedRecipe.description}
              </p>

              {/* Ingredients */}
              <div style={{ marginBottom: '24px' }}>
                <div className="section-heading">Ingredients</div>
                <div className="ingredients-grid">
                  {selectedRecipe.ingredients?.length > 0
                    ? selectedRecipe.ingredients.map((ing, i) => (
                        <div key={i} className="ingredient-item">· {ing}</div>
                      ))
                    : <div style={{ color: '#8c7d6e', fontSize: '0.8rem' }}>No ingredients listed.</div>
                  }
                </div>
              </div>

              {/* Instructions */}
              <div style={{ marginBottom: '24px' }}>
                <div className="section-heading">Instructions</div>
                <div className="instructions-block">
                  {selectedRecipe.instructions || "No instructions available."}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="detail-actions">
              {selectedRecipe._id &&
               selectedRecipe.userId === currentUserId ? (
                <button
                  onClick={() => handleDeleteRecipe(selectedRecipe._id)}
                  className="btn-delete"
                >
                  Delete Recipe
                </button>
              ) : <div />}
              <button onClick={() => setSelectedRecipe(null)} className="btn-create">
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default App;
