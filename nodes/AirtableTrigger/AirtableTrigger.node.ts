import type {
	IHookFunctions,
	IWebhookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	IDataObject,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

import {
	airtableApiRequest,
	extractFieldInfo,
	extractFieldSchemaInfo,
	extractTableMetadataInfo,
	getBases,
	getFields
} from './GenericFunctions';

export class AirtableTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Instant Airtable Trigger',
		name: 'airtableTrigger',
		icon: 'file:nodelogo.svg',
		group: ['trigger'],
		version: 1,
		description: 'Instantly handles Airtable events via webhooks. Made by vwork Digital.',
		defaults: {
			name: 'Instant Airtable Trigger',
		},
		inputs: [],
		outputs: [{ type: NodeConnectionType.Main }],
		credentials: [
			{
				name: 'airtableApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Base Name or ID',
				name: 'base',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBases',
				},
				required: true,
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Table Name or ID',
				name: 'table',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTables',
					loadOptionsDependsOn: ['base'],
				},
				required: true,
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Fields to Watch For Changes',
				name: 'fieldsToWatch',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getFields',
					loadOptionsDependsOn: ['base', 'table'],
				},
				default: [],
				description: 'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Extra Fields to Include in Output',
				name: 'fieldsToInclude',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getFields',
					loadOptionsDependsOn: ['base', 'table'],
				},
				default: [],
				description: 'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Include Previous Cell Values?',
				name: 'includePreviousValues',
				type: 'boolean',
				default: true,
				description: 'Whether to include previous field values in the output',
			},
			{
				displayName: 'Event Types',
				name: 'eventTypes',
				type: 'multiOptions',
				options: [
					{
						name: 'Record Created',
						value: 'add',
						description: 'Trigger when a record is created',
					},
					{
						name: 'Record Updated',
						value: 'update',
						description: 'Trigger when a record is updated',
					},
					{
						name: 'Record Deleted',
						value: 'remove',
						description: 'Trigger when a record is deleted',
					},
				],
				required: true,
				default: ['update'],
				description: 'The events to listen for',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Data Types',
						name: 'dataTypes',
						type: 'multiOptions',
						options: [
							{
								name: 'Table Data (Record and Cell Value Changes)',
								value: 'tableData',
							},
							{
								name: 'Table Fields (Field Changes)',
								value: 'tableFields',
							},
							{
								name: 'Table Metadata (Table Name and Description Changes)',
								value: 'tableMetadata',
							},
						],
						default: ['tableData'],
						description: 'Only generate payloads that contain changes affecting objects of these types',
					},
					{
						displayName: 'From Sources',
						name: 'fromSources',
						type: 'multiOptions',
						options: [
							{
								name: 'Anonymous User',
								value: 'anonymousUser',
							},
							{
								name: 'Automation (Via Automation Action)',
								value: 'automation',
							},
							{
								name: 'Client (User via Web or Mobile Clients)',
								value: 'client',
							},
							{
								name: 'Form Page Submission (Interface Forms)',
								value: 'formPageSubmission',
							},
							{
								name: 'Form Submission (Form View)',
								value: 'formSubmission',
							},
							{
								name: 'Public API (Via Airtable API)',
								value: 'publicApi',
							},
							{
								name: 'Sync (Airtable Sync)',
								value: 'sync',
							},
							{
								name: 'System (System Events)',
								value: 'system',
							},
							{
								name: 'Unknown',
								value: 'unknown',
							},
						],
						default: [],
						description: 'Only generate payloads for changes from these sources. If omitted, changes from all sources are reported.',
					},
					{
						displayName: 'Source Options',
						name: 'sourceOptions',
						type: 'string',
						default: '',
						placeholder: '{"formPageSubmission":{"pageId":"page123"},"formSubmission":{"viewId":"view456"}}',
						description: 'Additional options for source filtering in JSON format. Allows filtering form view submissions by ViewId, or interface form submissions by PageId.',
					},
					{
						displayName: 'Watch Schemas of Field IDs',
						name: 'watchSchemasOfFieldIds',
						type: 'multiOptions',
						typeOptions: {
							loadOptionsMethod: 'getFields',
							loadOptionsDependsOn: ['base', 'table'],
						},
						default: [],
						description: 'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getBases(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				console.log('Loading bases...');
				try {
					const bases = await getBases.call(this);
					console.log('Loaded bases:', bases);

					return bases.map(base => ({
						name: base.name,
						value: base.id,
					}));
				} catch (error) {
					console.error('Error loading bases:', error);
					return [];
				}
			},

			async getTables(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				console.log('Loading tables...');
				const baseId = this.getNodeParameter('base', '') as string;

				if (!baseId) {
					console.log('No base ID provided');
					return [];
				}

				try {
					// Direct API call to get tables
					const endpoint = `/meta/bases/${baseId}/tables`;
					console.log(`Calling API endpoint: ${endpoint}`);
					const response = await airtableApiRequest.call(this, 'GET', endpoint);

					console.log('Tables API response received');

					if (!response.tables || !Array.isArray(response.tables)) {
						console.error('Invalid response format: tables array is missing');
						return [];
					}

					console.log(`Loaded ${response.tables.length} tables from base ${baseId}`);
					response.tables.forEach((table: any) => {
						console.log(`- Table: ${table.name}, ID: ${table.id}, Fields: ${table.fields ? table.fields.length : 0}`);
					});

					return response.tables.map((table: any) => ({
						name: table.name,
						value: table.id,
						description: `${table.fields ? table.fields.length : 0} fields available`,
					}));
				} catch (error) {
					console.error('Error loading tables:', error);
					return [];
				}
			},

			async getFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				console.log('getFields method called in node');
				const baseId = this.getNodeParameter('base', '') as string;
				const tableId = this.getNodeParameter('table', '') as string;

				if (!baseId || !tableId) {
					console.log('Missing baseId or tableId');
					return [];
				}

				try {
					console.log(`Requesting fields for base: ${baseId}, table: ${tableId}`);
					const fields = await getFields.call(this, baseId, tableId);
					console.log(`Retrieved ${fields.length} fields:`, fields);

					if (!fields || fields.length === 0) {
						console.log('No fields returned from API');
						return [];
					}

					return fields.map(field => ({
						name: field.name,
						value: field.id,
						description: `Type: ${field.type}`,
					}));
				} catch (error) {
					console.error('Error in getFields:', error);
					return [];
				}
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				console.log('Checking if webhook exists...');
				const webhookData = this.getWorkflowStaticData('node');

				if (webhookData.webhookId === undefined) {
					console.log('No webhook ID in static data');
					return false;
				}

				try {
					const baseId = webhookData.baseId as string;
					console.log(`Checking if webhook ${webhookData.webhookId} exists for base ${baseId}`);

					const endpoint = `/bases/${baseId}/webhooks`;
					const { webhooks } = await airtableApiRequest.call(this, 'GET', endpoint);

					console.log('Existing webhooks:', webhooks);

					for (const webhook of webhooks) {
						if (webhook.id === webhookData.webhookId) {
							console.log('Webhook found');
							return true;
						}
					}

					console.log('Webhook not found');
					return false;
				} catch (error) {
					console.error('Error checking webhook existence:', error);
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				console.log('Creating webhook...');
				const webhookUrl = this.getNodeWebhookUrl('default');
				const webhookData = this.getWorkflowStaticData('node');

				const baseId = this.getNodeParameter('base') as string;
				const tableId = this.getNodeParameter('table') as string;
				const fieldsToWatch = this.getNodeParameter('fieldsToWatch', []) as string[];
				const includePreviousValues = this.getNodeParameter('includePreviousValues') as boolean;
				const eventTypes = this.getNodeParameter('eventTypes', []) as string[];

				console.log('Parameters:', {
					baseId,
					tableId,
					fieldsToWatch,
					includePreviousValues,
					eventTypes,
					webhookUrl
				});

				try {
					const endpoint = `/bases/${baseId}/webhooks`;
					const additionalFields = this.getNodeParameter('additionalFields', {}) as IDataObject;

					// Prepare the webhook specification
					const body: any = {
						notificationUrl: webhookUrl,
						specification: {
							options: {
								filters: {
									dataTypes: ['tableData'],
									recordChangeScope: tableId,
									changeTypes: eventTypes,
								},
								includes: {
									includePreviousCellValues: includePreviousValues
								}
							}
						}
					};

					// Add fields to watch if specified
					if (fieldsToWatch && fieldsToWatch.length > 0) {
						body.specification.options.filters.watchDataInFieldIds = fieldsToWatch;
					}

					// Add fields to include in the output
					const fieldsToInclude = this.getNodeParameter('fieldsToInclude', []) as string[];
					if (fieldsToInclude && fieldsToInclude.length > 0) {
						body.specification.options.includes.includeCellValuesInFieldIds = fieldsToInclude;
						console.log('Including these fields in the webhook payload:', fieldsToInclude);
					}

					// Process additional fields
					console.log('Processing additional fields:', additionalFields);

					// Add dataTypes if specified
					if (additionalFields.dataTypes && Array.isArray(additionalFields.dataTypes) && additionalFields.dataTypes.length > 0) {
						body.specification.options.filters.dataTypes = additionalFields.dataTypes;
						console.log('Setting dataTypes:', additionalFields.dataTypes);
					}

					// Add fromSources if specified
					if (additionalFields.fromSources && Array.isArray(additionalFields.fromSources) && additionalFields.fromSources.length > 0) {
						body.specification.options.filters.fromSources = additionalFields.fromSources;
						console.log('Setting fromSources:', additionalFields.fromSources);
					}

					// Add sourceOptions if specified
					if (additionalFields.sourceOptions) {
						try {
							// Parse the sourceOptions JSON string to an object
							const sourceOptions = JSON.parse(additionalFields.sourceOptions as string);
							body.specification.options.filters.sourceOptions = sourceOptions;
							console.log('Setting sourceOptions:', sourceOptions);
						} catch (error) {
							console.error('Error parsing sourceOptions JSON:', error);
							// Continue without adding sourceOptions if it's invalid JSON
						}
					}

					// Add watchSchemasOfFieldIds if specified
					if (additionalFields.watchSchemasOfFieldIds && Array.isArray(additionalFields.watchSchemasOfFieldIds) && additionalFields.watchSchemasOfFieldIds.length > 0) {
						body.specification.options.filters.watchSchemasOfFieldIds = additionalFields.watchSchemasOfFieldIds;
						console.log('Setting watchSchemasOfFieldIds:', additionalFields.watchSchemasOfFieldIds);
					}

					console.log('Creating webhook with body:', body);

					const response = await airtableApiRequest.call(this, 'POST', endpoint, body);
					console.log('Webhook creation response:', response);

					webhookData.webhookId = response.id;
					webhookData.baseId = baseId;
					webhookData.tableId = tableId;
					webhookData.macSecretBase64 = response.macSecretBase64;
					// Initialize to 0 - this means we haven't processed any payloads yet
					webhookData.lastCursor = 0;
					webhookData.fieldsToInclude = this.getNodeParameter('fieldsToInclude', []) as string[];
					webhookData.additionalFields = additionalFields;
					webhookData.eventTypes = eventTypes;

					console.log('Webhook created successfully:', {
						webhookId: webhookData.webhookId,
						baseId: webhookData.baseId,
						macSecret: webhookData.macSecretBase64,
						lastCursor: webhookData.lastCursor,
						additionalFields: webhookData.additionalFields,
						eventTypes: webhookData.eventTypes
					});

					return true;
				} catch (error) {
					console.error('Error creating webhook:', error);
					throw error;
				}
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				console.log('Deleting webhook...');
				const webhookData = this.getWorkflowStaticData('node');

				if (webhookData.webhookId === undefined || webhookData.baseId === undefined) {
					console.log('No webhook ID or base ID to delete');
					return false;
				}

				try {
					const endpoint = `/bases/${webhookData.baseId}/webhooks/${webhookData.webhookId}`;
					console.log(`Deleting webhook ${webhookData.webhookId} from base ${webhookData.baseId}`);

					await airtableApiRequest.call(this, 'DELETE', endpoint);

					// Clean up the static data
					delete webhookData.webhookId;
					delete webhookData.baseId;
					delete webhookData.tableId;
					delete webhookData.macSecretBase64;
					delete webhookData.lastCursor;
					delete webhookData.fieldsToInclude;
					delete webhookData.additionalFields;
					delete webhookData.eventTypes;

					console.log('Webhook deleted successfully');

					return true;
				} catch (error) {
					console.error('Error deleting webhook:', error);
					return false;
				}
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		console.log('Webhook triggered');
		const req = this.getRequestObject();
		const webhookData = this.getWorkflowStaticData('node');

		console.log('Webhook request body:', req.body);

		// Verify this is an Airtable webhook ping and not just any random request
		if (!req.body || !req.body.base || !req.body.webhook) {
			console.log('Invalid webhook request');
			return {};
		}

		try {
			// Extract data from the initial webhook notification
			const baseId = req.body.base.id;
			const webhookId = req.body.webhook.id;
			const timestamp = req.body.timestamp;

			console.log('Processing webhook notification:', { baseId, webhookId, timestamp });

			// Get the last processed cursor, defaulting to 0 if not set (0 means we haven't processed any)
			let lastProcessedCursor = webhookData.lastCursor as number || 0;
			console.log('Last processed cursor:', lastProcessedCursor);

			// Fetch all payloads starting from the last processed cursor
			const payloadEndpoint = `/bases/${baseId}/webhooks/${webhookId}/payloads`;
			const queryParams: any = {};

			// Only add cursor param if we have processed payloads before
			if (lastProcessedCursor > 0) {
				queryParams.cursor = lastProcessedCursor;
			}

			console.log('Fetching payloads with params:', queryParams);

			const payloadsResponse = await airtableApiRequest.call(this, 'GET', payloadEndpoint, {}, queryParams);

			console.log('Payloads response:', payloadsResponse);

			if (!payloadsResponse.payloads || payloadsResponse.payloads.length === 0) {
				console.log('No payloads found');
				return {};
			}

			// Filter payloads to only process ones we haven't seen before
			const newPayloads = payloadsResponse.payloads.filter((payload: any) => {
				const hasValidCursor = payload.cursor && payload.cursor > lastProcessedCursor;
				console.log(`Payload cursor: ${payload.cursor}, lastProcessed: ${lastProcessedCursor}, include: ${hasValidCursor}`);
				return hasValidCursor;
			});

			console.log(`Found ${newPayloads.length} new payloads out of ${payloadsResponse.payloads.length} total`);

			if (newPayloads.length === 0) {
				console.log('No new payloads to process after filtering');
				return {};
			}

			// Extract data from the payloads
			const formattedPayloads = [];
			const fieldsToInclude = (webhookData.fieldsToInclude as string[]) || [];

			console.log('Fields to include in output:', fieldsToInclude);

			for (const payload of newPayloads) {
				console.log('Processing payload with cursor:', payload.cursor);

				if (!payload.changedTablesById) {
					console.log('No table changes in payload');
					continue;
				}

				for (const tableId in payload.changedTablesById) {
					console.log(`Processing changes for table: ${tableId}`);
					if (!webhookData.tableId || tableId === webhookData.tableId) {
						const tableData = payload.changedTablesById[tableId];

						// Process record changes (cell values)
						if (tableData.changedRecordsById) {
							const changedRecords = tableData.changedRecordsById;
							console.log(`Found ${Object.keys(changedRecords).length} changed records in table ${tableId}`);

							// Extract field changes
							const fieldInfos = extractFieldInfo(changedRecords, fieldsToInclude);
							console.log(`Extracted ${fieldInfos.length} field info entries with included data`);

							for (const fieldInfo of fieldInfos) {
								formattedPayloads.push({
									...fieldInfo,
									tableId,
									cursor: payload.cursor, // Include cursor for debugging
									changedBy: payload.actionMetadata?.sourceMetadata?.user ? {
										userId: payload.actionMetadata.sourceMetadata.user.id,
										userName: payload.actionMetadata.sourceMetadata.user.name,
										userEmail: payload.actionMetadata.sourceMetadata.user.email,
									} : undefined,
									timestamp: payload.timestamp,
								});
							}
						}

						// Process field schema changes
						if (tableData.changedFieldsById) {
							console.log(`Processing field schema changes for table ${tableId}`);
							const fieldSchemaInfos = extractFieldSchemaInfo(tableData.changedFieldsById);

							for (const fieldSchemaInfo of fieldSchemaInfos) {
								formattedPayloads.push({
									...fieldSchemaInfo,
									tableId,
									cursor: payload.cursor, // Include cursor for debugging
									changedBy: payload.actionMetadata?.sourceMetadata?.user ? {
										userId: payload.actionMetadata.sourceMetadata.user.id,
										userName: payload.actionMetadata.sourceMetadata.user.name,
										userEmail: payload.actionMetadata.sourceMetadata.user.email,
									} : undefined,
									timestamp: payload.timestamp,
								});
							}
						}

						// Process table metadata changes
						if (tableData.changedMetadata) {
							console.log(`Processing table metadata changes for table ${tableId}`);
							const tableMetadataInfos = extractTableMetadataInfo(tableData.changedMetadata);

							for (const tableMetadataInfo of tableMetadataInfos) {
								formattedPayloads.push({
									...tableMetadataInfo,
									tableId,
									cursor: payload.cursor, // Include cursor for debugging
									changedBy: payload.actionMetadata?.sourceMetadata?.user ? {
										userId: payload.actionMetadata.sourceMetadata.user.id,
										userName: payload.actionMetadata.sourceMetadata.user.name,
										userEmail: payload.actionMetadata.sourceMetadata.user.email,
									} : undefined,
									timestamp: payload.timestamp,
								});
							}
						}
					}
				}
			}

			// Update the cursor to the highest cursor we've processed
			const highestCursor = Math.max(...newPayloads.map((p: any) => p.cursor || 0));
			webhookData.lastCursor = highestCursor;

			console.log('Updated lastCursor to:', webhookData.lastCursor);
			console.log('Formatted payloads:', formattedPayloads);

			return {
				workflowData: [
					this.helpers.returnJsonArray(formattedPayloads),
				],
			};
		} catch (error) {
			console.error('Error processing webhook:', error);
			// If there's an error, still return the original request body
			// so we have some data to work with for debugging
			return {
				workflowData: [
					this.helpers.returnJsonArray([req.body]),
				],
			};
		}
	}
}
