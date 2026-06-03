/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  IEvaosBrokerClaimDeviceCodeRequest,
  IEvaosBrokerSessionStatus,
  IEvaosRuntimeStatusRequest,
  IEvaosRuntimeStatusView,
} from '@/common/adapter/ipcBridge';
import {
  evaosBrokerErrorMessage,
  getDefaultEvaosBrokerSessionClient,
  type EvaosBrokerSessionClient,
} from '@process/services/evaosBrokerSession';

interface BridgeResponse<D = {}> {
  success: boolean;
  data?: D;
  msg?: string;
}

export function initEvaosBrokerBridge(client: EvaosBrokerSessionClient = getDefaultEvaosBrokerSessionClient()): void {
  ipcBridge.evaosBroker.claimDeviceCode.provider(
    async ({ deviceCode }: IEvaosBrokerClaimDeviceCodeRequest): Promise<BridgeResponse<IEvaosBrokerSessionStatus>> =>
      toBridgeResponse(() => client.claimDeviceCode(deviceCode))
  );

  ipcBridge.evaosBroker.getSessionStatus.provider(
    async (): Promise<BridgeResponse<IEvaosBrokerSessionStatus>> => ({
      success: true,
      data: client.getSessionStatus(),
    })
  );

  ipcBridge.evaosBroker.runtimeStatus.provider(
    async (request: IEvaosRuntimeStatusRequest): Promise<BridgeResponse<IEvaosRuntimeStatusView>> =>
      toBridgeResponse(() => client.runtimeStatus(request))
  );

  ipcBridge.evaosBroker.revokeSession.provider(
    async (): Promise<BridgeResponse<IEvaosBrokerSessionStatus>> => toBridgeResponse(() => client.revokeSession())
  );
}

async function toBridgeResponse<D>(operation: () => Promise<D>): Promise<BridgeResponse<D>> {
  try {
    return {
      success: true,
      data: await operation(),
    };
  } catch (error) {
    return {
      success: false,
      msg: evaosBrokerErrorMessage(error),
    };
  }
}
