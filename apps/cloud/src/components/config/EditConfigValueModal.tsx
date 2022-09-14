import { AutoComplete, Input, Modal, Spacer, Text, Toggle, useInput, useToasts } from '@geist-ui/core';
import { ModalHooksBindings } from '@geist-ui/core/dist/use-modal';
import { BindingsChangeTarget } from '@geist-ui/core/esm/use-input/use-input';
import { flattenConfigValues } from '@utils/shared/flattenConfig';
import { trpc } from '@utils/shared/trpc';
import { Config, ConfigValue } from '@utils/shared/types';
import dynamic from 'next/dynamic';
import React, { MutableRefObject, useState } from 'react';

const getConfigValue = <T,>(
  conf: Config | undefined,
  configValue: string | undefined,
  target: keyof ConfigValue[string]
) => conf?.values?.[configValue ?? '']?.[target] as T | undefined;

const EditConfigValueModalComponent: React.FC<{
  onCloseModel: () => void;
  bindings: ModalHooksBindings;
  config: MutableRefObject<Config | undefined>;
  configValue?: string;
  allowEdit?: boolean;
}> = ({ bindings, config, onCloseModel, configValue, allowEdit = true }) => {
  const toaster = useToasts();
  const { state: keyValue, setState: setKey, bindings: propertyBinding } = useInput(configValue ?? '');
  const {
    state: valueValue,
    setState: setValue,
    bindings: valueBinding,
  } = useInput(getConfigValue<string>(config.current, configValue, 'value') ?? '');
  const [hidden, setHidden] = useState(getConfigValue<boolean>(config.current, configValue, 'hidden') ?? false);
  const updateConfig = trpc.useMutation('config-update');
  const [invalid, setInvalid] = useState<undefined | string>(undefined);
  const [group, setGroup] = useState<string | null>(
    getConfigValue<string | null>(config.current, configValue, 'group') || null
  );
  const [groupOptions, setGroupOptions] = useState<Array<{ label: string; value: string }>>([]);

  if (!config.current) {
    return <></>;
  }

  const configMap = new Map(Object.entries(config!.current!.values));
  const allGroupOptions = Array.from(
    new Set(Array.from(Object.entries(flattenConfigValues(config.current!))).map(([, v]) => v.group)).values()
  )
    .filter((g) => g)
    .map((g) => ({ label: g!, value: g! }));

  const tryAddValue = () => {
    const key = keyValue.trim();
    const value = { value: valueValue, group: group || null, hidden };

    if (!key) {
      setKey(key);
      setInvalid('Invalid property name');
      return;
    }

    if (!configValue && configMap.has(key)) {
      setInvalid('Property already exists in config');
      return;
    }

    configMap.set(key, value);

    updateConfig.mutate(
      {
        projectId: config.current!.projectId,
        configId: config.current!.id,
        configVersion: config.current!.version,
        values: Object.fromEntries(configMap),
      },
      {
        onSuccess: () => {
          clearInput();
          onCloseModel();
        },
        onError: (error) => {
          if (error.data?.code === 'CONFLICT') {
            modalClose();
            setTimeout(() => {
              toaster.setToast({
                type: 'error',
                text: 'Failed to update config due to version mismatch, reloading',
                delay: 10000,
              });
            }, 500);
          } else {
            modalClose();
            toaster.setToast({ type: 'error', text: 'Failed to update config' });
          }
        },
      }
    );
  };

  const clearInput = () => {
    setInvalid(undefined);
    setKey('');
    setValue('');
    setGroup(null);
    setHidden(false);
  };

  const modalClose = () => {
    clearInput();

    if (bindings.onClose) {
      bindings.onClose();
    }

    onCloseModel();
  };

  const onInputChange = (binding: (event: BindingsChangeTarget) => void) => {
    return (event: BindingsChangeTarget) => {
      setInvalid(undefined);
      binding(event);
    };
  };

  const handleSearch = (searchValue: string) => {
    const currentOptions = allGroupOptions.filter(
      (g) => g.value.toLowerCase().includes(searchValue.toLowerCase()) || g.label.toLowerCase().includes(searchValue)
    );

    if (currentOptions.length === 0) {
      setGroupOptions([{ label: `Create group "${searchValue}"`, value: searchValue }]);
    } else {
      setGroupOptions(currentOptions);
    }
  };

  const handleGroupChange = (value: string) => {
    setGroup(value || null);
  };

  return (
    <Modal visible={bindings.visible} onClose={modalClose}>
      <Modal.Title>Add secret</Modal.Title>
      <Modal.Content>
        <Input
          disabled={!!configValue}
          placeholder="Property"
          value={propertyBinding.value}
          onChange={onInputChange(propertyBinding.onChange)}
          width="100%"
        />
        <Spacer />
        <Input
          placeholder="Value"
          value={valueBinding.value}
          onChange={onInputChange(valueBinding.onChange)}
          width="100%"
        />
        <Spacer />
        <AutoComplete
          clearable
          width="100%"
          placeholder="Group"
          initialValue={group ?? undefined}
          options={groupOptions}
          onChange={handleGroupChange}
          onSearch={handleSearch}
        />
        <Spacer />
        <div className="flex items-center gap-2">
          <label htmlFor="hiddenToggle">Hidden</label>
          <Toggle id="hiddenToggle" padding={0} initialChecked={hidden} onChange={(e) => setHidden(e.target.checked)} />
        </div>
        <Text p type="error">
          {invalid}
        </Text>
      </Modal.Content>
      <Modal.Action onClick={modalClose}>Cancel</Modal.Action>
      {allowEdit ? <Modal.Action onClick={tryAddValue}>{!configValue ? 'Create' : 'Update'}</Modal.Action> : undefined}
    </Modal>
  );
};

export const EditConfigValueModal = dynamic(() => Promise.resolve(EditConfigValueModalComponent), { ssr: true });
