import { activities, projects, ambiguityCases, validateFixtureRelations } from './development';
validateFixtureRelations();
console.log(
  `Validated ${activities.length} main-project activities, ${projects.length} projects and ${ambiguityCases.length} ambiguity scenarios. Synthetic development data only.`,
);
