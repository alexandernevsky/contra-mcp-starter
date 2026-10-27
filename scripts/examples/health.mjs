#!/usr/bin/env node
import { ContraClient } from '../contra-client.mjs';
try {
  const client = new ContraClient();
  const initialization = await client.initialize();
  const tools = await client.listTools();
  for (const name of ['whoami', 'list_services', 'list_portfolio_projects']) {
    if (!tools.some((tool) => tool.name === name)) throw new Error(`Missing required tool: ${name}`);
  }
  const me = await client.callTool('whoami');
  const username = me?.visitor?.userAccount?.profile?.displayUsername;
  if (!username) throw new Error('whoami did not identify the account.');
  const services = await client.callTool('list_services', { username });
  const portfolio = await client.callTool('list_portfolio_projects', { username, includeDrafts: false, limit: 10 });
  if (!Array.isArray(services?.services) || !Array.isArray(portfolio?.projects)) throw new Error('Unexpected services/portfolio response shape.');
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), protocolVersion: initialization.protocolVersion, toolCount: tools.length, identityVerified: true, servicesReturned: services.services.length, publishedProjectsReturned: portfolio.projects.length, portfolioLimit: 10, contentMutations: 0 }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
