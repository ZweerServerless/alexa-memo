import {
  ErrorHandler,
  HandlerInput,
  PersistenceAdapter,
  RequestHandler,
  SkillBuilders,
} from 'ask-sdk-core';
import {
  IntentRequest,
  Response,
  SessionEndedRequest,
} from 'ask-sdk-model';
import { DynamoDbPersistenceAdapter } from 'ask-sdk-dynamodb-persistence-adapter';

const { DYNAMODB_TABLE_MEMOS } = process.env;

const dynamoDbPersistenceAdapter : PersistenceAdapter = new DynamoDbPersistenceAdapter({
  tableName: DYNAMODB_TABLE_MEMOS,
  createTable: true,
});

const cardTitle = 'Memo';

type handler = (handlerInput: HandlerInput) => Response | Promise<Response>;
type errorHandler = (handlerInput: HandlerInput, error: Error) => Response;

abstract class AbstractRequestHandler implements RequestHandler {
  public handle: handler;
  readonly requestType: string;

  protected constructor(handle: handler, requestType: string) {
    this.handle = handle;
    this.requestType = requestType;
  }

  canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === this.requestType;
  }
}

class LaunchRequestHandler extends AbstractRequestHandler {
  constructor(handle: handler) {
    super(handle, 'LaunchRequest');
  }
}

class IntentRequestHandler extends AbstractRequestHandler {
  private intents: string[];

  constructor(intent: string | string[], handle: handler) {
    super(handle, 'IntentRequest');

    this.intents = typeof intent === 'string' ? [intent] : intent;
  }

  canHandle(handlerInput: HandlerInput): boolean {
    return super.canHandle(handlerInput) && this.intents.includes((handlerInput.requestEnvelope.request as IntentRequest).intent.name);
  }
}

class SessionRequestHandler extends AbstractRequestHandler {
  constructor(handle: handler) {
    super(handle, 'SessionEndedRequest');
  }
}

class ErrorRequestHandler implements ErrorHandler {
  public handle: errorHandler;

  constructor(handle: errorHandler) {
    this.handle = handle;
  }

  canHandle(): boolean {
    return true;
  }
}

async function launchHandler(handlerInput: HandlerInput): Promise<Response> {
  const attributes = await dynamoDbPersistenceAdapter.getAttributes(handlerInput.requestEnvelope);
  const { memos = [] } = attributes;

  const speechText = `Welcome to the Memo Skill, you have ${memos.length === 0 ? 'no' : memos.length} message${memos.length === 1 ? '' : 's'}!`;

  return handlerInput.responseBuilder
    .speak(speechText)
    .reprompt(speechText)
    .withSimpleCard(cardTitle, speechText)
    .getResponse();
}

async function createMemoHandler(handlerInput: HandlerInput): Promise<Response> {
  const request = handlerInput.requestEnvelope.request as IntentRequest;

  if (request.dialogState !== 'COMPLETED') {
    return handlerInput.responseBuilder
      .addDelegateDirective(request.intent)
      .getResponse();
  }

  const memo = request.intent.slots.Memo.value;

  const attributes = await dynamoDbPersistenceAdapter.getAttributes(handlerInput.requestEnvelope);
  const { memos = [] } = attributes;

  memos.push(memo);
  await dynamoDbPersistenceAdapter.saveAttributes(handlerInput.requestEnvelope, attributes);

  const speechText = `Memo created: ${memo}`;

  return handlerInput.responseBuilder
    .speak(speechText)
    .withSimpleCard(cardTitle, speechText)
    .getResponse();
}

async function deleteMemoHandler(handlerInput: HandlerInput): Promise<Response> {
  const attributes = await dynamoDbPersistenceAdapter.getAttributes(handlerInput.requestEnvelope);

  attributes.memos = [];
  await dynamoDbPersistenceAdapter.saveAttributes(handlerInput.requestEnvelope, attributes);

  const speechText = 'Deletion completed';

  return handlerInput.responseBuilder
    .speak(speechText)
    .reprompt(speechText)
    .withSimpleCard(cardTitle, speechText)
    .getResponse();
}

async function listenMemoHandler(handlerInput: HandlerInput): Promise<Response> {
  const attributes = await dynamoDbPersistenceAdapter.getAttributes(handlerInput.requestEnvelope);
  const { memos = [] } = attributes;

  let speechText;

  if (memos.length) {
    speechText = `Here is your message${memos.length > 1 ? '' : 's'}: `;
    speechText += memos.join(', ');
  } else {
    speechText = 'You have no messages to listen to.';
  }

  return handlerInput.responseBuilder
    .speak(speechText)
    .reprompt(speechText)
    .withSimpleCard(cardTitle, speechText)
    .getResponse();
}

function helpHandler(handlerInput: HandlerInput): Response {
  const speechText = 'You can save memo and re listen to it';

  return handlerInput.responseBuilder
    .speak(speechText)
    .reprompt(speechText)
    .withSimpleCard(cardTitle, speechText)
    .getResponse();
}

function cancelAndStopHandler(handlerInput: HandlerInput): Response {
  const speechText = 'Goodbye!';

  return handlerInput.responseBuilder
    .speak(speechText)
    .withSimpleCard(cardTitle, speechText)
    .getResponse();
}

function sessionEndedHandler(handlerInput: HandlerInput): Response {
  console.log(`Session ended with reason: ${(handlerInput.requestEnvelope.request as SessionEndedRequest).reason}`);

  return handlerInput.responseBuilder.getResponse();
}

function errorHandler(handlerInput : HandlerInput, error: Error): Response {
  console.log(`Error handled: ${error.message}`);

  return handlerInput.responseBuilder
    .speak('Sorry, I can\'t understand the command. Please say again.')
    .reprompt('Sorry, I can\'t understand the command. Please say again.')
    .getResponse();
}

export const handleSkill = SkillBuilders.custom()
  .addRequestHandlers(
    new LaunchRequestHandler(launchHandler),
    new IntentRequestHandler('CreateMemoIntent', createMemoHandler),
    new IntentRequestHandler('DeleteMemoIntent', deleteMemoHandler),
    new IntentRequestHandler('ListenMemoIntent', listenMemoHandler),
    new IntentRequestHandler('AMAZON.HelpIntent', helpHandler),
    new IntentRequestHandler(['AMAZON.CancelIntent', 'AMAZON.StopIntent'], cancelAndStopHandler),
    new SessionRequestHandler(sessionEndedHandler),
  )
  .addErrorHandlers(new ErrorRequestHandler(errorHandler))
  .lambda();
