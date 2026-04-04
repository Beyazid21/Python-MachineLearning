import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal as RNModal,
  ScrollView,
} from 'react-native';
import { useAuthStore } from '../../src/stores/authStore';
import { useTableStore } from '../../src/stores/tableStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useProductStore } from '../../src/stores/productStore';
import { usePermissions } from '../../src/hooks/usePermissions';
import { useTimer } from '../../src/hooks/useTimer';
import { useRouter } from 'expo-router';
import {
  Table,
  TableGroup,
  Session,
  SessionType,
  SessionStatus,
  PricingRule,
  PricingRuleType,
  PricingValueType,
} from '../../src/types';
import { Header, Badge, EmptyState } from '../../src/components';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../src/theme';
import { TIME_PRESETS } from '../../src/constants';
import {
  formatCurrency,
  getRoleDisplayName,
  getActiveRuleNamesForTableNow,
  isPricingRuleApplicableToTable,
} from '../../src/utils';
import { ArrowLeftRight } from 'lucide-react-native';

// ════════════════════════════════════════════════════════════
//  ANA KOMPONENT
// ════════════════════════════════════════════════════════════

export default function DashboardScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser);
  const currentClub = useAuthStore((s) => s.currentClub);
  const logout = useAuthStore((s) => s.logout);

  const allTables = useTableStore((s) => s.tables);
  const allGroups = useTableStore((s) => s.groups);
  const pricingRules = useTableStore((s) => s.pricingRules);
  const manualRuleStatesByTable = useTableStore((s) => s.manualRuleStatesByTable);
  const setManualRuleStateForTable = useTableStore((s) => s.setManualRuleStateForTable);
  const tableViewModeByClub = useTableStore((s) => s.tableViewModeByClub);

  const tables = useMemo(
    () => allTables.filter((t) => t.clubId === (currentClub?.id ?? '')),
    [allTables, currentClub?.id]
  );
  const groups = useMemo(
    () => allGroups.filter((g) => g.clubId === (currentClub?.id ?? '')),
    [allGroups, currentClub?.id]
  );
  const tableViewMode = tableViewModeByClub[currentClub?.id ?? ''] ?? 2;
  const clubPricingRules = useMemo(
    () => pricingRules.filter((r) => r.clubId === (currentClub?.id ?? '')),
    [pricingRules, currentClub?.id]
  );

  const sessions = useSessionStore((s) => s.sessions);
  const openSession = useSessionStore((s) => s.openSession);
  const closeSession = useSessionStore((s) => s.closeSession);
  const cancelSession = useSessionStore((s) => s.cancelSession);
  const extendSession = useSessionStore((s) => s.extendSession);
  const addOrderToSession = useSessionStore((s) => s.addOrderToSession);
  const updateOrderItemQuantity = useSessionStore((s) => s.updateOrderItemQuantity);
  const removeOrderItem = useSessionStore((s) => s.removeOrderItem);
  const trackManualPricingToggle = useSessionStore((s) => s.trackManualPricingToggle);
  const exchangeSessionsBetweenTables = useSessionStore((s) => s.exchangeSessionsBetweenTables);

  const activeSessionMap = useMemo(() => {
    const map = new Map<string, Session>();
    sessions.forEach((s) => {
      if (
        s.clubId === (currentClub?.id ?? '') &&
        (s.status === SessionStatus.ACTIVE || s.status === SessionStatus.OVERTIME)
      ) {
        map.set(s.tableId, s);
      }
    });
    return map;
  }, [sessions, currentClub?.id]);

  const getActiveSession = useCallback(
    (tableId: string) => activeSessionMap.get(tableId),
    [activeSessionMap]
  );

  const products = useProductStore((s) => s.getProductsByClubId)(currentClub?.id ?? '');
  const { can } = usePermissions();

  // ── State ──────────────────────────────────────────────────
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showActiveModal, setShowActiveModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showCustomTimeModal, setShowCustomTimeModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [showDelayedModal, setShowDelayedModal] = useState(false);
  const [exchangeSourceTable, setExchangeSourceTable] = useState<Table | null>(null);
  const [customHours, setCustomHours] = useState(1);
  const [customMinutes, setCustomMinutes] = useState(0);
  const [minuteInputMode, setMinuteInputMode] = useState(false);
  const [minuteInputValue, setMinuteInputValue] = useState('0');
  const [delayedHour, setDelayedHour] = useState(new Date().getHours());
  const [delayedMinute, setDelayedMinute] = useState(new Date().getMinutes());
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [groupViewEnabled, setGroupViewEnabled] = useState(false);

  const clubName = currentClub?.name ?? 'ClubQM';
  const roleName = currentUser ? getRoleDisplayName(currentUser.role) : '';
  const hasAnyGroup = groups.length > 0;

  const activeColumns = useMemo(() => {
    if (tableViewMode === 'dynamic') {
      const approx = (tables.length > 0 ? tables.length : 2) >= 8 ? 4 : 3;
      return Math.max(2, Math.min(5, approx));
    }
    return tableViewMode;
  }, [tableViewMode, tables.length]);

  useEffect(() => {
    setGroupViewEnabled(hasAnyGroup);
  }, [hasAnyGroup]);

  // ── Handlers ───────────────────────────────────────────────

  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 300);
  }

  function handleTablePress(table: Table) {
    if (!can('canOpenTable') && !can('canViewDashboard')) return;
    setSelectedTable(table);
    const session = getActiveSession(table.id);
    if (session) {
      setShowActiveModal(true);
    } else if (can('canOpenTable')) {
      setShowOpenModal(true);
    }
  }

  function handleOpenTable(type: SessionType, minutes: number | null, customStartAt?: string) {
    if (!selectedTable || !currentUser || !currentClub) return;

    const created = openSession(
      selectedTable.id,
      currentClub.id,
      type,
      minutes,
      selectedTable.hourlyRate,
      currentUser.id,
      customStartAt
    );

    if (!created) {
      Alert.alert('Giriş Bloklanıb', 'Klub deaktiv edildiyi üçün masa açıla bilməz.');
    }

    setShowOpenModal(false);
    setShowCustomTimeModal(false);
    setShowDelayedModal(false);
    setSelectedTable(null);
  }

  function handleCloseTable() {
    if (!selectedTable || !currentUser) return;
    const session = getActiveSession(selectedTable.id);
    if (!session) return;

    Alert.alert('Masanı Bağla', 'Sessiyanı bağlamaq istədiyinizə əminsiniz?', [
      { text: 'Xeyr', style: 'cancel' },
      {
        text: 'Bəli, Bağla',
        style: 'destructive',
        onPress: () => {
          closeSession(session.id, currentUser.id);
          setShowActiveModal(false);
          setSelectedTable(null);
        },
      },
    ]);
  }

  function handleCancelTable() {
    if (!selectedTable) return;
    const session = getActiveSession(selectedTable.id);
    if (!session) return;

    Alert.alert(
      'Sessiyanı Ləğv Et',
      'Sessiya tamamilə silinəcək və tarixçəyə düşməyəcək. Əminsiniz?',
      [
        { text: 'Xeyr', style: 'cancel' },
        {
          text: 'Ləğv et',
          style: 'destructive',
          onPress: () => {
            cancelSession(session.id, currentUser?.id ?? '');
            setShowActiveModal(false);
            setSelectedTable(null);
          },
        },
      ]
    );
  }

  function handleExtendTime(minutes: number) {
    if (!selectedTable) return;
    const session = getActiveSession(selectedTable.id);
    if (!session) return;
    extendSession(session.id, minutes);
    Alert.alert('Uğurlu', `${minutes} dəqiqə əlavə edildi.`);
  }

  function handleSubmitOrder() {
    if (!selectedTable || !currentUser) return;
    const session = getActiveSession(selectedTable.id);
    if (!session) return;

    const items = Object.entries(orderItems)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, quantity]) => {
        const product = products.find((p) => p.id === productId)!;
        return { product, quantity };
      });

    if (items.length === 0) {
      Alert.alert('Xəta', 'Ən azı 1 məhsul seçin.');
      return;
    }

    addOrderToSession(session.id, items, currentUser.id);
    setOrderItems({});
    setShowOrderModal(false);
    Alert.alert('Uğurlu', 'Sifariş əlavə edildi.');
  }

  function handleOpenExchange(sourceTable: Table) {
    if (!getActiveSession(sourceTable.id)) {
      Alert.alert('Xəta', 'Köçürmə üçün bu masada aktiv sessiya olmalıdır.');
      return;
    }
    setExchangeSourceTable(sourceTable);
    setShowExchangeModal(true);
  }

  function applyManualRuleStatesForMove(sourceId: string, targetId: string) {
    const sourceStates = manualRuleStatesByTable[sourceId] ?? {};
    clubPricingRules
      .filter((r) => r.type === PricingRuleType.MANUAL)
      .forEach((rule) => {
        setManualRuleStateForTable(targetId, rule.id, sourceStates[rule.id] ?? false);
        setManualRuleStateForTable(sourceId, rule.id, false);
      });
  }

  function applyManualRuleStatesForSwap(sourceId: string, targetId: string) {
    const sourceStates = manualRuleStatesByTable[sourceId] ?? {};
    const targetStates = manualRuleStatesByTable[targetId] ?? {};
    clubPricingRules
      .filter((r) => r.type === PricingRuleType.MANUAL)
      .forEach((rule) => {
        setManualRuleStateForTable(targetId, rule.id, sourceStates[rule.id] ?? false);
        setManualRuleStateForTable(sourceId, rule.id, targetStates[rule.id] ?? false);
      });
  }

  function handleConfirmExchange(targetTable: Table) {
    if (!exchangeSourceTable) return;
    if (exchangeSourceTable.id === targetTable.id) {
      Alert.alert('Xəta', 'Eyni masa seçilə bilməz.');
      return;
    }

    const sourceSession = getActiveSession(exchangeSourceTable.id);
    if (!sourceSession) {
      Alert.alert('Xəta', 'Mənbə masada aktiv sessiya tapılmadı.');
      return;
    }

    const targetSession = getActiveSession(targetTable.id);
    exchangeSessionsBetweenTables(
      exchangeSourceTable.id,
      targetTable.id,
      exchangeSourceTable.hourlyRate,
      targetTable.hourlyRate
    );

    if (targetSession) {
      applyManualRuleStatesForSwap(exchangeSourceTable.id, targetTable.id);
    } else {
      applyManualRuleStatesForMove(exchangeSourceTable.id, targetTable.id);
    }

    setShowExchangeModal(false);
    setExchangeSourceTable(null);
    Alert.alert(
      'Uğurlu',
      targetSession ? 'Masalar arasında sessiyalar yer dəyişdi.' : 'Sessiya seçilən masaya köçürüldü.'
    );
  }

  function getApplicableManualRules(table: Table | null): PricingRule[] {
    if (!table) return [];
    return clubPricingRules
      .filter((r) => r.type === PricingRuleType.MANUAL)
      .filter((r) => isPricingRuleApplicableToTable(r, table));
  }

  function handleToggleManualRule(table: Table, ruleId: string, enabled: boolean) {
    setManualRuleStateForTable(table.id, ruleId, enabled);
    const session = getActiveSession(table.id);
    if (session) trackManualPricingToggle(session.id, ruleId, enabled);
  }

  // ── Render helpers ─────────────────────────────────────────

  function renderTableCard(item: Table) {
    const session = getActiveSession(item.id);
    const isOccupied = !!session;
    const activeRuleNames = getActiveRuleNamesForTableNow({
      table: item,
      rules: clubPricingRules,
      manualRuleState: manualRuleStatesByTable[item.id] ?? {},
    });

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.tableCard,
          {
            borderColor: isOccupied
              ? session.status === SessionStatus.OVERTIME
                ? COLORS.tableOvertime
                : COLORS.tableOccupied
              : COLORS.tableAvailable,
          },
        ]}
        onPress={() => handleTablePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.tableHeader}>
          <Text style={styles.tableName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.tableHeaderRight}>
            {isOccupied && can('canOpenTable') && (
              <TouchableOpacity
                style={styles.exchangeBtn}
                onPress={(e) => { e.stopPropagation?.(); handleOpenExchange(item); }}
              >
                <ArrowLeftRight size={12} color="#fff" />
              </TouchableOpacity>
            )}
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isOccupied
                    ? session.status === SessionStatus.OVERTIME
                      ? COLORS.tableOvertime
                      : COLORS.tableOccupied
                    : COLORS.tableAvailable,
                },
              ]}
            />
          </View>
        </View>

        {isOccupied ? (
          <TableTimer session={session} />
        ) : (
          <View style={styles.emptyTable}>
            <Text style={styles.emptyText}>Boş</Text>
            <Text style={styles.rateText}>{formatCurrency(item.hourlyRate)}/saat</Text>
          </View>
        )}

        {isOccupied && (
          <Text style={styles.sessionType}>
            {session.type === SessionType.UNLIMITED ? '♾️ Limitsiz'
              : session.type === SessionType.TIMED ? '⏱️ Vaxtlı'
              : '🎯 Xüsusi'}
          </Text>
        )}

        {activeRuleNames.length > 0 && (
          <Text style={styles.appliedRuleText} numberOfLines={1}>
            {activeRuleNames[0]} tətbiq edilir
            {activeRuleNames.length > 1 ? ` (+${activeRuleNames.length - 1})` : ''}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  function chunkTables(list: Table[], columns: number): Table[][] {
    const rows: Table[][] = [];
    for (let i = 0; i < list.length; i += columns) rows.push(list.slice(i, i + columns));
    return rows;
  }

  function renderTableRows(list: Table[], keyPrefix: string) {
    return chunkTables(list, activeColumns).map((row, rowIdx) => (
      <View key={`${keyPrefix}_row_${rowIdx}`} style={styles.row}>
        {row.map((table, colIdx) => (
          <View
            key={`${keyPrefix}_cell_${rowIdx}_${colIdx}`}
            style={[styles.gridCell, { width: `${100 / activeColumns}%` }]}
          >
            {renderTableCard(table)}
          </View>
        ))}
        {row.length < activeColumns &&
          Array.from({ length: activeColumns - row.length }).map((_, i) => (
            <View
              key={`${keyPrefix}_empty_${rowIdx}_${i}`}
              style={[styles.gridCell, { width: `${100 / activeColumns}%` }]}
            />
          ))}
      </View>
    ));
  }

  function renderGroupedSection(group: TableGroup, groupedTables: Table[]) {
    if (groupedTables.length === 0) return null;
    return (
      <View key={group.id} style={styles.groupSection}>
        <View style={styles.groupSectionHeader}>
          <Text style={styles.groupSectionTitle}>{group.name}</Text>
          <Text style={styles.groupSectionMeta}>{groupedTables.length} masa</Text>
        </View>
        <View style={styles.groupSectionBox}>
          {renderTableRows(groupedTables, group.id)}
        </View>
      </View>
    );
  }

  // ── JSX ────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Header
        title={clubName}
        subtitle={`${roleName} · ${tables.length} masa`}
        rightIcon={<Text style={{ fontSize: 18 }}>🚪</Text>}
        onRightPress={() => {
          Alert.alert('Çıxış', 'Sistemdən çıxmaq istəyirsiniz?', [
            { text: 'Xeyr', style: 'cancel' },
            { text: 'Çıxış', style: 'destructive', onPress: () => { logout(); router.replace('/'); } },
          ]);
        }}
      />

      {hasAnyGroup && (
        <View style={styles.groupToggleRow}>
          <Text style={styles.groupToggleText}>Qrup görünüşü</Text>
          <Switch
            value={groupViewEnabled}
            onValueChange={setGroupViewEnabled}
            trackColor={{ false: COLORS.surfaceHighlight, true: 'rgba(0, 212, 255, 0.4)' }}
            thumbColor={groupViewEnabled ? COLORS.primary : COLORS.textTertiary}
          />
        </View>
      )}

      {hasAnyGroup && groupViewEnabled ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.groupedContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {groups.map((group) =>
            renderGroupedSection(group, tables.filter((t) => t.groupId === group.id))
          )}
          {tables.some((t) => !t.groupId) && (
            <View style={styles.groupSection}>
              <View style={styles.groupSectionHeader}>
                <Text style={styles.groupSectionTitle}>Qrupsuz Masalar</Text>
                <Text style={styles.groupSectionMeta}>{tables.filter((t) => !t.groupId).length} masa</Text>
              </View>
              <View style={styles.groupSectionBox}>
                {renderTableRows(tables.filter((t) => !t.groupId), 'ungrouped')}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.gridContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {tables.length === 0 ? (
            <EmptyState icon="🎮" title="Masa tapılmadı" message="Menyu bölməsindən yeni masalar əlavə edin." />
          ) : (
            renderTableRows(tables, 'default')
          )}
        </ScrollView>
      )}

      {/* ═══ MODAL: Masa Açma ═══ */}
      <RNModal visible={showOpenModal} transparent animationType="slide" onRequestClose={() => setShowOpenModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedTable?.name} — Masanı Aç</Text>
            <Text style={styles.modalSubtitle}>Qiymət: {formatCurrency(selectedTable?.hourlyRate ?? 0)}/saat</Text>

            {selectedTable && getApplicableManualRules(selectedTable).length > 0 && (
              <View style={styles.ruleToggleBox}>
                <Text style={styles.ruleToggleTitle}>⚙️ Əlavə qiymət qaydaları</Text>
                {getApplicableManualRules(selectedTable).map((rule) => {
                  const isEnabled = manualRuleStatesByTable[selectedTable.id]?.[rule.id] ?? false;
                  return (
                    <View key={rule.id} style={styles.ruleToggleRow}>
                      <View style={{ flex: 1, marginRight: SPACING.md }}>
                        <Text style={styles.ruleToggleName}>{rule.name}</Text>
                        <Text style={styles.ruleToggleMeta}>
                          {rule.isIncrease ? '+' : '-'}
                          {rule.valueType === PricingValueType.PERCENT ? `${rule.value}%` : `${rule.value.toFixed(2)} ₼`}
                        </Text>
                      </View>
                      <Switch
                        value={isEnabled}
                        onValueChange={(next) => handleToggleManualRule(selectedTable, rule.id, next)}
                        trackColor={{ false: COLORS.surfaceHighlight, true: 'rgba(0, 212, 255, 0.4)' }}
                        thumbColor={isEnabled ? COLORS.primary : COLORS.textTertiary}
                      />
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={styles.sectionLabel}>⏱️ Müəyyən Vaxt</Text>
            <View style={styles.presetGrid}>
              {TIME_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.minutes}
                  style={styles.presetBtn}
                  onPress={() => handleOpenTable(SessionType.TIMED, preset.minutes)}
                >
                  <Text style={styles.presetText}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.unlimitedBtn} onPress={() => handleOpenTable(SessionType.UNLIMITED, null)}>
              <Text style={styles.unlimitedIcon}>♾️</Text>
              <Text style={styles.unlimitedText}>Limitsiz</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.customBtn}
              onPress={() => { setShowOpenModal(false); setShowCustomTimeModal(true); }}
            >
              <Text style={styles.customIcon}>🎯</Text>
              <Text style={styles.customText}>Vaxtı Özüm Təyin Et</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.customBtn, { borderColor: COLORS.warning, backgroundColor: 'rgba(255, 179, 0, 0.05)' }]}
              onPress={() => {
                const now = new Date();
                setDelayedHour(now.getHours());
                setDelayedMinute(now.getMinutes());
                setShowOpenModal(false);
                setShowDelayedModal(true);
              }}
            >
              <Text style={styles.customIcon}>⏪</Text>
              <Text style={[styles.customText, { color: COLORS.warning }]}>Gecikmiş Başlatma</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeModalBtn} onPress={() => { setShowOpenModal(false); setSelectedTable(null); }}>
              <Text style={styles.closeModalText}>Ləğv et</Text>
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>

      {/* ═══ MODAL: Sessiya Köçür / Swap ═══ */}
      <RNModal visible={showExchangeModal} transparent animationType="slide" onRequestClose={() => setShowExchangeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔁 Sessiyanı Köçür</Text>
            <Text style={styles.modalSubtitle}>Mənbə masa: {exchangeSourceTable?.name ?? '-'}</Text>
            <ScrollView style={{ marginVertical: SPACING.md }} showsVerticalScrollIndicator={false}>
              {tables
                .filter((t) => t.id !== exchangeSourceTable?.id)
                .map((table) => {
                  const occupied = !!getActiveSession(table.id);
                  return (
                    <TouchableOpacity
                      key={table.id}
                      style={styles.exchangeTargetRow}
                      onPress={() => handleConfirmExchange(table)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.exchangeTargetName}>{table.name}</Text>
                        <Text style={styles.exchangeTargetMeta}>
                          {occupied ? 'Dolu (swap ediləcək)' : 'Boş (köçürüləcək)'} · {formatCurrency(table.hourlyRate)}/saat
                        </Text>
                      </View>
                      <ArrowLeftRight size={16} color={COLORS.primary} />
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => { setShowExchangeModal(false); setExchangeSourceTable(null); }}>
              <Text style={styles.closeModalText}>Ləğv et</Text>
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>

      {/* ═══ MODAL: Xüsusi Vaxt ═══ */}
      <RNModal visible={showCustomTimeModal} transparent animationType="slide" onRequestClose={() => setShowCustomTimeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Vaxtı Təyin Et</Text>
            <View style={styles.timePickerRow}>
              <View style={styles.timeCol}>
                <Text style={styles.timeLabel}>Saat</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => setCustomHours(Math.max(0, customHours - 1))}>
                    <Text style={styles.counterBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{customHours}</Text>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => setCustomHours(customHours + 1)}>
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.timeSeparator}>:</Text>
              <View style={styles.timeCol}>
                <Text style={styles.timeLabel}>Dəqiqə</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => setCustomMinutes(Math.max(0, customMinutes - 1))}>
                    <Text style={styles.counterBtnText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setMinuteInputMode(true); setMinuteInputValue(customMinutes.toString()); }}>
                    {minuteInputMode ? (
                      <TextInput
                        style={styles.counterInput}
                        value={minuteInputValue}
                        onChangeText={(t) => setMinuteInputValue(t.replace(/[^0-9]/g, ''))}
                        onBlur={() => {
                          setCustomMinutes(Math.min(59, Math.max(0, parseInt(minuteInputValue) || 0)));
                          setMinuteInputMode(false);
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                        autoFocus
                        selectTextOnFocus
                      />
                    ) : (
                      <Text style={styles.counterValue}>{customMinutes}</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => setCustomMinutes(Math.min(59, customMinutes + 1))}>
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.unlimitedBtn, { backgroundColor: COLORS.primary }]}
              onPress={() => {
                const total = customHours * 60 + customMinutes;
                if (total <= 0) { Alert.alert('Xəta', 'Vaxt 0-dan çox olmalıdır.'); return; }
                handleOpenTable(SessionType.CUSTOM, total);
              }}
            >
              <Text style={[styles.unlimitedText, { color: '#000' }]}>
                Başlat ({customHours}s {customMinutes}d)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => { setShowCustomTimeModal(false); setShowOpenModal(true); }}>
              <Text style={styles.closeModalText}>← Geri</Text>
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>

      {/* ═══ MODAL: Gecikmiş Başlatma ═══ */}
      <RNModal visible={showDelayedModal} transparent animationType="slide" onRequestClose={() => setShowDelayedModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>⏪ Gecikmiş Başlatma</Text>
              <Text style={styles.modalSubtitle}>
                Sessiyanın başladığı keçmiş vaxtı daxil edin.{'\n'}
                {selectedTable?.name} — {formatCurrency(selectedTable?.hourlyRate ?? 0)}/saat
              </Text>
              <View style={styles.timePickerRow}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeLabel}>Saat</Text>
                  <View style={styles.counterRow}>
                    <TouchableOpacity style={styles.counterBtn} onPress={() => setDelayedHour(Math.max(0, delayedHour - 1))}>
                      <Text style={styles.counterBtnText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.counterInput}
                      value={delayedHour.toString().padStart(2, '0')}
                      onChangeText={(t) => setDelayedHour(Math.min(23, Math.max(0, parseInt(t.replace(/[^0-9]/g, '')) || 0)))}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <TouchableOpacity style={styles.counterBtn} onPress={() => setDelayedHour(Math.min(23, delayedHour + 1))}>
                      <Text style={styles.counterBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.timeSeparator}>:</Text>
                <View style={styles.timeCol}>
                  <Text style={styles.timeLabel}>Dəqiqə</Text>
                  <View style={styles.counterRow}>
                    <TouchableOpacity style={styles.counterBtn} onPress={() => setDelayedMinute(Math.max(0, delayedMinute - 1))}>
                      <Text style={styles.counterBtnText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.counterInput}
                      value={delayedMinute.toString().padStart(2, '0')}
                      onChangeText={(t) => setDelayedMinute(Math.min(59, Math.max(0, parseInt(t.replace(/[^0-9]/g, '')) || 0)))}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <TouchableOpacity style={styles.counterBtn} onPress={() => setDelayedMinute(Math.min(59, delayedMinute + 1))}>
                      <Text style={styles.counterBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.unlimitedBtn, { backgroundColor: COLORS.warning }]}
                onPress={() => {
                  const now = new Date();
                  const past = new Date();
                  past.setHours(delayedHour, delayedMinute, 0, 0);
                  if (past.getTime() > now.getTime()) {
                    Alert.alert('Xəta', 'Keçmiş vaxt seçilməlidir.');
                    return;
                  }
                  const diffMin = Math.round((now.getTime() - past.getTime()) / 60000);
                  const h = Math.floor(diffMin / 60);
                  const m = diffMin % 60;
                  Alert.alert(
                    'Gecikmiş Başlatma',
                    `Sessiya ${delayedHour.toString().padStart(2, '0')}:${delayedMinute.toString().padStart(2, '0')}-dan başladılacaq.\nArtıq keçən vaxt: ${h}s ${m}d\n\nLimitsiz olaraq açılacaq.`,
                    [
                      { text: 'Ləğv et', style: 'cancel' },
                      { text: 'Başlat', onPress: () => handleOpenTable(SessionType.UNLIMITED, null, past.toISOString()) },
                    ]
                  );
                }}
              >
                <Text style={[styles.unlimitedText, { color: '#000' }]}>
                  Gecikmiş Başlat ({delayedHour.toString().padStart(2, '0')}:{delayedMinute.toString().padStart(2, '0')})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeModalBtn} onPress={() => { setShowDelayedModal(false); setShowOpenModal(true); }}>
                <Text style={styles.closeModalText}>← Geri</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </RNModal>

      {/* ═══ MODAL: Aktiv Sessiya İdarəetmə ═══ */}
      <RNModal visible={showActiveModal} transparent animationType="slide" onRequestClose={() => setShowActiveModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedTable && getActiveSession(selectedTable.id) && (
              <ActiveSessionPanel
                table={selectedTable}
                session={getActiveSession(selectedTable.id)!}
                onClose={() => { setShowActiveModal(false); setSelectedTable(null); }}
                onCloseSession={handleCloseTable}
                onCancelSession={handleCancelTable}
                onExtendTime={handleExtendTime}
                onAddOrder={() => { setShowActiveModal(false); setOrderItems({}); setShowOrderModal(true); }}
                onUpdateQuantity={(productId, delta) => {
                  const s = getActiveSession(selectedTable.id);
                  if (s) updateOrderItemQuantity(s.id, productId, delta);
                }}
                onRemoveItem={(productId) => {
                  const s = getActiveSession(selectedTable.id);
                  if (s) removeOrderItem(s.id, productId);
                }}
                canOperate={can('canOpenTable')}
                manualRules={getApplicableManualRules(selectedTable)}
                manualRuleStates={manualRuleStatesByTable[selectedTable.id] ?? {}}
                onToggleManualRule={(ruleId, next) => handleToggleManualRule(selectedTable, ruleId, next)}
              />
            )}
          </View>
        </View>
      </RNModal>

      {/* ═══ MODAL: Sifariş Əlavəsi ═══ */}
      <RNModal visible={showOrderModal} transparent animationType="slide" onRequestClose={() => setShowOrderModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>🛒 Məhsul Əlavə Et</Text>
            <Text style={styles.modalSubtitle}>{selectedTable?.name}</Text>
            <ScrollView style={{ marginVertical: SPACING.lg }}>
              {products.map((product) => (
                <View key={product.id} style={styles.orderItemRow}>
                  <View style={styles.orderItemInfo}>
                    <Text style={styles.orderItemName}>{product.name}</Text>
                    <Text style={styles.orderItemPrice}>{formatCurrency(product.price)}</Text>
                  </View>
                  <View style={styles.counterRow}>
                    <TouchableOpacity
                      style={styles.counterBtnSmall}
                      onPress={() => setOrderItems((prev) => ({ ...prev, [product.id]: Math.max(0, (prev[product.id] || 0) - 1) }))}
                    >
                      <Text style={styles.counterBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.counterValueSmall}>{orderItems[product.id] || 0}</Text>
                    <TouchableOpacity
                      style={styles.counterBtnSmall}
                      onPress={() => setOrderItems((prev) => ({ ...prev, [product.id]: (prev[product.id] || 0) + 1 }))}
                    >
                      <Text style={styles.counterBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.orderTotal}>
              <Text style={styles.orderTotalLabel}>Cəmi:</Text>
              <Text style={styles.orderTotalValue}>
                {formatCurrency(
                  Object.entries(orderItems).reduce((sum, [id, qty]) => {
                    const p = products.find((pr) => pr.id === id);
                    return sum + (p?.price ?? 0) * qty;
                  }, 0)
                )}
              </Text>
            </View>
            <TouchableOpacity style={[styles.unlimitedBtn, { backgroundColor: COLORS.success }]} onPress={handleSubmitOrder}>
              <Text style={[styles.unlimitedText, { color: '#000' }]}>Sifarişi Təsdiqlə</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => { setShowOrderModal(false); setShowActiveModal(true); }}>
              <Text style={styles.closeModalText}>← Geri</Text>
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>
    </View>
  );
}

// ════════════════════════════════════════════════════════════
//  ALT KOMPONENT: TableTimer
// ════════════════════════════════════════════════════════════

function TableTimer({ session }: { session: Session }) {
  const timer = useTimer({
    startedAt: session.startedAt,
    plannedMinutes: session.plannedDurationMinutes,
    type: session.type,
    status: session.status,
  });

  return (
    <View style={styles.timerContainer}>
      <Text style={[styles.timerText, timer.isOvertime && styles.timerOvertime]}>
        {timer.display}
      </Text>
      {timer.isOvertime && <Text style={styles.overtimeLabel}>OVERTIME</Text>}
    </View>
  );
}

// ════════════════════════════════════════════════════════════
//  ALT KOMPONENT: ActiveSessionPanel
// ════════════════════════════════════════════════════════════

function ActiveSessionPanel({
  table, session, onClose, onCloseSession, onCancelSession,
  onExtendTime, onAddOrder, onUpdateQuantity, onRemoveItem,
  canOperate, manualRules, manualRuleStates, onToggleManualRule,
}: {
  table: Table;
  session: Session;
  onClose: () => void;
  onCloseSession: () => void;
  onCancelSession: () => void;
  onExtendTime: (minutes: number) => void;
  onAddOrder: () => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  canOperate: boolean;
  manualRules: PricingRule[];
  manualRuleStates: Record<string, boolean>;
  onToggleManualRule: (ruleId: string, next: boolean) => void;
}) {
  const getCurrentSessionTimeRevenue = useSessionStore((s) => s.getCurrentSessionTimeRevenue);
  const [showExtendInput, setShowExtendInput] = useState(false);
  const [extendMinutesInput, setExtendMinutesInput] = useState('');

  const timer = useTimer({
    startedAt: session.startedAt,
    plannedMinutes: session.plannedDurationMinutes,
    type: session.type,
    status: session.status,
  });

  const currentCost = getCurrentSessionTimeRevenue(session.id);
  const orderTotal = session.orders.reduce((sum, o) => sum + o.totalAmount, 0);

  const mergedItems = useMemo(() => {
    const map: Record<string, { productName: string; productId: string; quantity: number; unitPrice: number; totalPrice: number }> = {};
    session.orders.forEach((order) => {
      order.items.forEach((item) => {
        if (map[item.productId]) {
          map[item.productId].quantity += item.quantity;
          map[item.productId].totalPrice += item.totalPrice;
        } else {
          map[item.productId] = { ...item };
        }
      });
    });
    return Object.values(map);
  }, [session.orders]);

  function submitExtendMinutes() {
    const parsed = parseInt(extendMinutesInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Alert.alert('Xəta', 'Dəqiqə üçün 0-dan böyük tam ədəd daxil edin.');
      return;
    }
    onExtendTime(parsed);
    setExtendMinutesInput('');
    setShowExtendInput(false);
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={styles.modalTitle}>{table.name}</Text>

      <View style={styles.activeTimerBox}>
        <Text style={[styles.activeTimerText, timer.isOvertime && { color: COLORS.danger }]}>
          {timer.display}
        </Text>
        {timer.isOvertime && <Badge text="OVERTIME" variant="danger" small />}
        <Badge
          text={session.type === SessionType.UNLIMITED ? 'Limitsiz' : session.type === SessionType.TIMED ? 'Vaxtlı' : 'Xüsusi'}
          variant="primary"
          small
        />
      </View>

      {session.plannedDurationMinutes && (
        <View style={[
          styles.remainingTimeBox,
          timer.isOvertime && { borderColor: 'rgba(255,61,61,0.3)', backgroundColor: 'rgba(255,61,61,0.05)' }
        ]}>
          <Text style={[styles.remainingTimeLabel, timer.isOvertime && { color: COLORS.danger }]}>
            {timer.isOvertime ? '⏰ Vaxt bitib!' : '⏳ Qalan vaxt:'}
          </Text>
          <Text style={[styles.remainingTimeValue, timer.isOvertime && { color: COLORS.danger }]}>
            {timer.display}
          </Text>
          {!timer.isOvertime && (
            <Text style={styles.remainingTimePlan}>(Plan: {session.plannedDurationMinutes} dəq)</Text>
          )}
        </View>
      )}

      <View style={styles.costBox}>
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>PS vaxt:</Text>
          <Text style={styles.costValue}>{formatCurrency(Math.round(currentCost * 100) / 100)}</Text>
        </View>
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>Məhsullar:</Text>
          <Text style={styles.costValue}>{formatCurrency(orderTotal)}</Text>
        </View>
        <View style={[styles.costRow, styles.costTotal]}>
          <Text style={styles.costTotalLabel}>CƏMİ:</Text>
          <Text style={styles.costTotalValue}>{formatCurrency(Math.round((currentCost + orderTotal) * 100) / 100)}</Text>
        </View>
      </View>

      {manualRules.length > 0 && canOperate && (
        <View style={styles.ruleToggleBox}>
          <Text style={styles.ruleToggleTitle}>⚙️ Əlavə qiymət qaydaları</Text>
          {manualRules.map((rule) => (
            <View key={rule.id} style={styles.ruleToggleRow}>
              <View style={{ flex: 1, marginRight: SPACING.md }}>
                <Text style={styles.ruleToggleName}>{rule.name}</Text>
                <Text style={styles.ruleToggleMeta}>
                  {rule.isIncrease ? '+' : '-'}
                  {rule.valueType === PricingValueType.PERCENT ? `${rule.value}%` : `${rule.value.toFixed(2)} ₼`}
                </Text>
              </View>
              <Switch
                value={manualRuleStates[rule.id] ?? false}
                onValueChange={(next) => onToggleManualRule(rule.id, next)}
                trackColor={{ false: COLORS.surfaceHighlight, true: 'rgba(0, 212, 255, 0.4)' }}
                thumbColor={(manualRuleStates[rule.id] ?? false) ? COLORS.primary : COLORS.textTertiary}
              />
            </View>
          ))}
        </View>
      )}

      {mergedItems.length > 0 && (
        <View style={styles.existingOrdersBox}>
          <Text style={styles.existingOrdersTitle}>🛒 Sifarişlər</Text>
          {mergedItems.map((item) => (
            <View key={item.productId} style={styles.existingOrderRow}>
              <View style={styles.existingOrderInfo}>
                <Text style={styles.existingOrderName}>{item.productName}</Text>
                <Text style={styles.existingOrderPrice}>
                  {formatCurrency(item.unitPrice)} × {item.quantity} = {formatCurrency(item.totalPrice)}
                </Text>
              </View>
              {canOperate && (
                <View style={styles.orderControlRow}>
                  <TouchableOpacity style={styles.counterBtnSmall} onPress={() => onUpdateQuantity(item.productId, -1)}>
                    <Text style={styles.counterBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.existingOrderQtyText}>{item.quantity}</Text>
                  <TouchableOpacity style={styles.counterBtnSmall} onPress={() => onUpdateQuantity(item.productId, 1)}>
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.trashBtn}
                    onPress={() => {
                      Alert.alert('Məhsulu Sil', `"${item.productName}" sifarişdən silinsin?`, [
                        { text: 'Xeyr', style: 'cancel' },
                        { text: 'Sil', style: 'destructive', onPress: () => onRemoveItem(item.productId) },
                      ]);
                    }}
                  >
                    <Text style={styles.trashBtnText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
          <View style={styles.existingOrderTotal}>
            <Text style={styles.existingOrderTotalLabel}>Məhsul cəmi:</Text>
            <Text style={styles.existingOrderTotalValue}>{formatCurrency(orderTotal)}</Text>
          </View>
        </View>
      )}

      {canOperate && (
        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionBtn} onPress={onAddOrder}>
            <Text style={styles.actionIcon}>🛒</Text>
            <Text style={styles.actionText}>Məhsul Əlavə Et</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowExtendInput((p) => !p)}>
            <Text style={styles.actionIcon}>⏱️</Text>
            <Text style={styles.actionText}>Vaxt Artır</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={onCloseSession}>
            <Text style={styles.actionIcon}>💰</Text>
            <Text style={styles.actionText}>Hesabı Kəs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionCancel]} onPress={onCancelSession}>
            <Text style={styles.actionIcon}>🗑️</Text>
            <Text style={styles.actionText}>Ləğv Et</Text>
          </TouchableOpacity>
        </View>
      )}

      {canOperate && showExtendInput && (
        <View style={styles.extendInputBox}>
          <Text style={styles.extendInputLabel}>Əlavə dəqiqə</Text>
          <TextInput
            style={styles.extendInputField}
            value={extendMinutesInput}
            onChangeText={setExtendMinutesInput}
            placeholder="Məs: 75"
            placeholderTextColor={COLORS.textTertiary}
            keyboardType="number-pad"
            maxLength={4}
          />
          <View style={styles.extendInputActions}>
            <TouchableOpacity style={styles.extendCancelBtn} onPress={() => setShowExtendInput(false)}>
              <Text style={styles.extendCancelText}>Ləğv</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extendConfirmBtn} onPress={submitExtendMinutes}>
              <Text style={styles.extendConfirmText}>Əlavə et</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.closeModalBtn} onPress={onClose}>
        <Text style={styles.closeModalText}>Bağla</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ════════════════════════════════════════════════════════════
//  ÜSLUBLAR
// ════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  groupToggleRow: { marginHorizontal: SPACING.md, marginBottom: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupToggleText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600' },
  gridContent: { padding: SPACING.md, paddingBottom: SPACING.xxxl },
  groupedContent: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxxl },
  groupSection: { marginBottom: SPACING.lg },
  groupSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm, paddingHorizontal: SPACING.xs },
  groupSectionTitle: { fontSize: FONT_SIZES.md, color: COLORS.primary, fontWeight: '700' },
  groupSectionMeta: { fontSize: FONT_SIZES.xs, color: COLORS.textTertiary, fontWeight: '600' },
  groupSectionBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.lg, paddingTop: SPACING.md, paddingHorizontal: SPACING.sm, backgroundColor: 'rgba(255,255,255,0.01)' },
  gridCell: { paddingHorizontal: SPACING.xs },
  row: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: SPACING.sm, width: '100%' },
  tableCard: { width: '100%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, borderWidth: 2, aspectRatio: 1 },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  tableHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  exchangeBtn: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  tableName: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.textPrimary, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  emptyTable: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: FONT_SIZES.lg, color: COLORS.success, fontWeight: '600' },
  rateText: { fontSize: FONT_SIZES.xs, color: COLORS.textTertiary, marginTop: SPACING.xs },
  timerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  timerText: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary, fontVariant: ['tabular-nums'] },
  timerOvertime: { color: COLORS.danger },
  overtimeLabel: { fontSize: FONT_SIZES.xs, color: COLORS.danger, fontWeight: '700', marginTop: 2 },
  sessionType: { fontSize: FONT_SIZES.xs, color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.sm },
  appliedRuleText: { fontSize: FONT_SIZES.xs, color: COLORS.warning, textAlign: 'center', marginTop: SPACING.xs, fontWeight: '700' },
  ruleToggleBox: { marginTop: SPACING.md, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, padding: SPACING.md },
  ruleToggleTitle: { fontSize: FONT_SIZES.sm, color: COLORS.textPrimary, fontWeight: '700', marginBottom: SPACING.sm },
  ruleToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.xs },
  ruleToggleName: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600' },
  ruleToggleMeta: { fontSize: FONT_SIZES.xs, color: COLORS.textTertiary, marginTop: 2 },
  exchangeTargetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  exchangeTargetName: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.textPrimary },
  exchangeTargetMeta: { fontSize: FONT_SIZES.xs, color: COLORS.textTertiary, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surfaceElevated, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, padding: SPACING.xxl, paddingBottom: SPACING.xxxl + 10, borderWidth: 1, borderColor: COLORS.border, borderBottomWidth: 0 },
  modalTitle: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  modalSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  sectionLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600', marginBottom: SPACING.md, marginTop: SPACING.lg },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  presetBtn: { backgroundColor: COLORS.surfaceHighlight, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, borderWidth: 1, borderColor: COLORS.border },
  presetText: { color: COLORS.textPrimary, fontSize: FONT_SIZES.md, fontWeight: '600' },
  unlimitedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,212,255,0.1)', borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.lg, marginTop: SPACING.lg, borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)' },
  unlimitedIcon: { fontSize: 18, marginRight: SPACING.sm },
  unlimitedText: { color: COLORS.primary, fontSize: FONT_SIZES.lg, fontWeight: '700' },
  customBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceHighlight, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.lg, marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  customIcon: { fontSize: 18, marginRight: SPACING.sm },
  customText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.md, fontWeight: '600' },
  closeModalBtn: { alignItems: 'center', paddingVertical: SPACING.lg, marginTop: SPACING.lg },
  closeModalText: { color: COLORS.textTertiary, fontSize: FONT_SIZES.md, fontWeight: '500' },
  timePickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: SPACING.xl },
  timeCol: { alignItems: 'center' },
  timeLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textTertiary, marginBottom: SPACING.md },
  timeSeparator: { fontSize: 28, color: COLORS.textTertiary, marginHorizontal: SPACING.xl, fontWeight: '800' },
  counterRow: { flexDirection: 'row', alignItems: 'center' },
  counterBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  counterBtnText: { fontSize: 22, color: COLORS.textPrimary, fontWeight: '700' },
  counterValue: { fontSize: 28, color: COLORS.textPrimary, fontWeight: '800', marginHorizontal: SPACING.xl, minWidth: 40, textAlign: 'center' },
  counterInput: { fontSize: 28, color: COLORS.textPrimary, fontWeight: '800', marginHorizontal: SPACING.md, minWidth: 50, textAlign: 'center', borderBottomWidth: 2, borderBottomColor: COLORS.primary, paddingVertical: 2 },
  activeTimerBox: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  activeTimerText: { fontSize: 42, fontWeight: '900', color: COLORS.primary, fontVariant: ['tabular-nums'] },
  remainingTimeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, backgroundColor: 'rgba(0,212,255,0.05)', borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', marginBottom: SPACING.lg },
  remainingTimeLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600' },
  remainingTimeValue: { fontSize: FONT_SIZES.lg, color: COLORS.primary, fontWeight: '800', fontVariant: ['tabular-nums'] },
  remainingTimePlan: { fontSize: FONT_SIZES.xs, color: COLORS.textTertiary },
  costBox: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.xl },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm },
  costLabel: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
  costValue: { fontSize: FONT_SIZES.md, color: COLORS.textPrimary, fontWeight: '600' },
  costTotal: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.sm, paddingTop: SPACING.md },
  costTotalLabel: { fontSize: FONT_SIZES.lg, color: COLORS.primary, fontWeight: '800' },
  costTotalValue: { fontSize: FONT_SIZES.lg, color: COLORS.primary, fontWeight: '800' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.lg },
  actionBtn: { flexBasis: '47%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  actionDanger: { borderColor: 'rgba(255,61,61,0.3)', backgroundColor: 'rgba(255,61,61,0.05)' },
  actionCancel: { borderColor: 'rgba(176,176,176,0.2)' },
  actionIcon: { fontSize: 24, marginBottom: SPACING.sm },
  actionText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600', textAlign: 'center' },
  extendInputBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, backgroundColor: COLORS.surface, marginBottom: SPACING.md },
  extendInputLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600', marginBottom: SPACING.sm },
  extendInputField: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: COLORS.textPrimary, fontSize: FONT_SIZES.md, backgroundColor: COLORS.background },
  extendInputActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.md },
  extendCancelBtn: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  extendCancelText: { color: COLORS.textSecondary, fontWeight: '600' },
  extendConfirmBtn: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: 'rgba(0,212,255,0.12)' },
  extendConfirmText: { color: COLORS.primary, fontWeight: '700' },
  orderItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  orderItemInfo: { flex: 1 },
  orderItemName: { fontSize: FONT_SIZES.md, color: COLORS.textPrimary, fontWeight: '600' },
  orderItemPrice: { fontSize: FONT_SIZES.sm, color: COLORS.textTertiary, marginTop: 2 },
  counterBtnSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  counterValueSmall: { fontSize: FONT_SIZES.lg, color: COLORS.textPrimary, fontWeight: '700', marginHorizontal: SPACING.md, minWidth: 24, textAlign: 'center' },
  orderTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border },
  orderTotalLabel: { fontSize: FONT_SIZES.lg, color: COLORS.textPrimary, fontWeight: '700' },
  orderTotalValue: { fontSize: FONT_SIZES.lg, color: COLORS.success, fontWeight: '800' },
  existingOrdersBox: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.xl, borderWidth: 1, borderColor: COLORS.border },
  existingOrdersTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.textSecondary, marginBottom: SPACING.md },
  existingOrderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  existingOrderInfo: { flex: 1 },
  existingOrderName: { fontSize: FONT_SIZES.sm, color: COLORS.textPrimary, fontWeight: '600' },
  existingOrderPrice: { fontSize: FONT_SIZES.xs, color: COLORS.textTertiary, marginTop: 2 },
  existingOrderQtyText: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '700', marginHorizontal: SPACING.sm, minWidth: 24, textAlign: 'center' },
  orderControlRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  trashBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,61,61,0.1)', justifyContent: 'center', alignItems: 'center', marginLeft: SPACING.xs },
  trashBtnText: { fontSize: 14 },
  existingOrderTotal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.md, paddingTop: SPACING.md },
  existingOrderTotalLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600' },
  existingOrderTotalValue: { fontSize: FONT_SIZES.sm, color: COLORS.success, fontWeight: '700' },
});
