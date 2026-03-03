A. Nature of the Data and Privacy Risks
Although a recipe platform may seem innocuous, handling "dietary restrictions" involves processing indirectly sensitive data. Knowing that a user is searching for gluten-free, sugar-free, or pork-free recipes could reveal medical conditions (celiac disease, diabetes) or religious beliefs (halal/kosher diets).

Risk: If the MongoDB database is compromised, this information could be exposed, violating students' medical or personal privacy.

Mitigation: We apply strict access control (REQ21) and ensure that dietary preferences are not public in user profiles, keeping them visible only to the recommendation engine.

B. Bias and Fairness
The Recommendation Service presents a risk of creating "filter bubbles." If the algorithm only recommends very popular recipes or expensive ingredients.

Ethical consideration: The algorithm must be balanced to include affordable options and less popular recipes to give visibility to all content creators (amateur cooks), ensuring fair distribution on the platform.

C. Social Impact
The platform's social impact is overwhelmingly positive. It fosters university students' autonomy in cooking their own food, improving their nutritional health and reducing food waste by suggesting recipes based on readily available ingredients. Furthermore, the comment system encourages the creation of a collaborative and supportive community around gastronomy.

To maintain this positive impact, the development team recognizes the future need to implement moderation filters in the Recipe Service to prevent inappropriate language or harassment in the comments section.